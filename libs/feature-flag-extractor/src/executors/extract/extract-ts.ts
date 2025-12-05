import * as ts from 'typescript';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FlagRead } from './models/flag-read';
import { Context } from './models/context';
import { extractFeatureFlagsFromTemplate, TemplateMetadata } from './extract-angular';
import { ProjectService } from './project-service';
import { isStaticString, isObjectKeyAndEquals, typeContainsSymbol } from './ts-util';
import { SourceFilePositionManager } from './source-file-position-manager';

export function extractFeatureFlagsFromTs(
    ctx: Context,
    projectService: ProjectService,
    sourceFile: ts.SourceFile
): FlagRead[] {
    const filePath = sourceFile.fileName;

    ctx.logger.info('-----------------------------------------------------------------------');
    ctx.logger.info(`parsing TS file: ${filePath}`);
    const flagReads: FlagRead[] = [];

    const typeChecker = projectService.getTypeChecker();

    const visit = (node: ts.Node): void => {
        if (ts.isElementAccessExpression(node)) {
            const flag = extractFlagFromElementAccess(ctx, typeChecker, node);

            if (flag) {
                const { line, character } = sourceFile.getLineAndCharacterOfPosition(
                    node.getStart()
                );
                // TODO: report position of element access key, not the element access itself
                flagReads.push({
                    source: 'comp',
                    filePath,
                    row: line,
                    col: character + 1,
                    flagId: flag,
                });
            }
        } else if (ts.isClassDeclaration(node)) {
            const decoratorArg = getAngularComponentMetadataFromDecorators(node);
            if (decoratorArg) {
                const template = getTemplateFromComponentMetadata(ctx, filePath, decoratorArg);
                if (template) {
                    ctx.logger.info(
                        ` found template: ${template.path} (offset=${template.offset})`
                    );
                    const templateFlagReads = extractFeatureFlagsFromTemplate(
                        ctx,
                        projectService,
                        template
                    );

                    const positionManager = new SourceFilePositionManager(
                        ctx,
                        filePath,
                        template.kind === 'external' ? template.content : sourceFile.getFullText()
                    );

                    // Translate offset of flag ID to row & col in source file
                    for (const tfr of templateFlagReads) {
                        const templateLine = positionManager.getLineAtOffset(tfr.offset);
                        let row = 0;
                        let col = tfr.offset;
                        if (templateLine.line) {
                            row = templateLine.row;
                            col = templateLine.col;
                        }
                        flagReads.push({
                            source: tfr.source,
                            filePath: tfr.filePath,
                            row,
                            col,
                            flagId: tfr.flagId,
                        });
                    }
                }
            }
        }

        ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);

    return flagReads;
}

function getAngularComponentMetadataFromDecorators(
    classDecl: ts.HasDecorators
): ts.ObjectLiteralExpression | null {
    const decorators = ts.getDecorators(classDecl) ?? [];
    for (const d of decorators) {
        if (
            ts.isCallExpression(d.expression) &&
            ts.isIdentifier(d.expression.expression) &&
            d.expression.expression.text === 'Component'
        ) {
            const firstArg = d.expression.arguments[0];
            if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
                return firstArg;
            }
        }
    }
    return null;
}

/**
 * Extract the flag ID from an element access expression.
 * @param node The element access expression node.
 * @returns The flag ID or null if the node doesn't match our criteria.
 */
function extractFlagFromElementAccess(
    ctx: Context,
    typeChecker: ts.TypeChecker,
    node: ts.ElementAccessExpression
): string | null {
    // ctx.logger.debug(`TEST [src=COMP] element access: \`\`\` ${node.getText()} \`\`\``);

    const receiverType = typeChecker.getTypeAtLocation(node.expression);

    const receiverTypeContainsLDFlagSet = typeContainsSymbol(
        typeChecker,
        receiverType,
        'LDFlagSet'
    );
    if (!receiverTypeContainsLDFlagSet) {
        return null;
    }

    ctx.logger.debug(`>>> EXTRACT [src=COMP] flag read: \`\`\` ${node.getText()} \`\`\``);

    // TODO: replace the below key evaluation with a visitor that does partial evaluation for
    // strings (e.g. "StringPartialVisitor").

    // Extract the flag ID
    let flag: string | null = null;

    if (isStaticString(node.argumentExpression)) {
        // Direct string literal like `flags['feature']`
        flag = node.argumentExpression.text;
    } else {
        // Handle property reads like `flags[FEATURE_FLAG]`
        const keyType = typeChecker.getTypeAtLocation(node.argumentExpression);
        const keyTypeString = typeChecker.typeToString(keyType);

        if (keyTypeString.startsWith('"')) {
            // Key is a string literal
            flag = keyTypeString.replace(/['"]/g, '');
        } else if (
            ts.isIdentifier(node.argumentExpression) ||
            ts.isPropertyAccessExpression(node.argumentExpression)
        ) {
            // Try to find the literal value from symbol declaration
            flag = extractDynamicFlag(typeChecker, node.argumentExpression);
        } else {
            // Neither a string literal nor an identifier/property read
            ctx.logger.warn(
                `element access of 'LDFlagSet' with key of unsupported type: \`\`\` ${keyTypeString} \`\`\``
            );
        }
    }

    if (!flag) {
        ctx.logger.warn(
            `unable to get flag ID from 'LDFlagSet' read: \`\`\` ${node.getText()} \`\`\``
        );
    }

    return flag;
}

/**
 * Extract the flag ID from the value of an identifier or property.
 * @param expression The identifier (e.g. `flagName`) or property (e.g. `this.flagName`).
 * @returns The flag ID or null if the node doesn't match our criteria.
 */
function extractDynamicFlag(
    typeChecker: ts.TypeChecker,
    expression: ts.Identifier | ts.PropertyAccessExpression
): string | null {
    const symbol = typeChecker.getSymbolAtLocation(expression);

    if (symbol && symbol.declarations && symbol.declarations.length > 0) {
        const decl = symbol.declarations[0];
        // Check if it's a variable declaration with initializer
        // VariableDeclaration:
        //     const name = ...;
        // PropertyAssignment:
        //     { name: ... }
        // PropertyDeclaration:
        //     class { name = ...; }
        if (
            (ts.isVariableDeclaration(decl) ||
                ts.isPropertyAssignment(decl) ||
                ts.isPropertyDeclaration(decl)) &&
            decl.initializer
        ) {
            if (ts.isStringLiteral(decl.initializer)) {
                return decl.initializer.text;
            }
        }
    }

    return null;
}

const TEMPLATE_LINE_RE = /^(\s*['"`]).*/s;

function getTemplateFromComponentMetadata(
    ctx: Context,
    filePath: string,
    metadata: ts.ObjectLiteralExpression
): TemplateMetadata | null {
    for (const prop of metadata.properties) {
        if (ts.isPropertyAssignment(prop)) {
            if (isObjectKeyAndEquals(prop.name, 'template')) {
                if (isStaticString(prop.initializer)) {
                    const beforeTemplate = prop.initializer
                        .getFullText()
                        .replace(TEMPLATE_LINE_RE, '$1');
                    const offset = prop.initializer.getFullStart() + beforeTemplate.length;

                    return {
                        kind: 'inline',
                        path: filePath,
                        content: prop.initializer.text,
                        offset,
                    };
                } else {
                    ctx.logger.warn(
                        `inline template is not a string literal in component: ${filePath}`
                    );
                    return null;
                }
                // TODO: handle initializer that is an identifier of a constant.
            } else if (isObjectKeyAndEquals(prop.name, 'templateUrl')) {
                if (!isStaticString(prop.initializer)) {
                    ctx.logger.warn(
                        `template URL is not a string literal in component: ${filePath}`
                    );
                    return null;
                }
                // TODO: handle initializer that is an identifier of a constant.

                const templateUrl = prop.initializer.text;

                try {
                    // Resolve the template path relative to the component
                    const componentDir = path.dirname(filePath);
                    const templatePath = path.resolve(componentDir, templateUrl);

                    try {
                        const content = fs.readFileSync(templatePath, 'utf-8');
                        return {
                            kind: 'external',
                            path: templatePath,
                            content,
                            offset: 0,
                        };
                    } catch (err) {
                        if (
                            err &&
                            typeof err === 'object' &&
                            'code' in err &&
                            err.code === 'ENOENT'
                        ) {
                            ctx.logger.warn(
                                `template URL file not found for component: ${filePath}`
                            );
                            return null;
                        } else {
                            throw err;
                        }
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : `${error}`;
                    throw new Error(
                        `Failed to read template file for component: ${filePath}\n\n${message}`
                    );
                }
            }
        }
    }

    return null;
}
