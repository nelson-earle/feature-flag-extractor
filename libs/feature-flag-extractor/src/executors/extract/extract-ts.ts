import * as ts from 'typescript';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FlagRead } from './models/flag-read';
import { Context } from './models/context';
import { extractFeatureFlagsFromTemplate, TemplateMetadata } from './extract-angular';
import { ProjectService } from './project-service';
import { extractStringLiteralValue, isObjectKeyAndEquals, typeContainsSymbol } from './ts-util';
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
            const flagId = extractFlagFromElementAccess(ctx, typeChecker, node);

            if (flagId) {
                const { line, character: colStart } = sourceFile.getLineAndCharacterOfPosition(
                    node.argumentExpression.getStart()
                );
                const { character: colEnd } = sourceFile.getLineAndCharacterOfPosition(
                    node.argumentExpression.getEnd()
                );
                flagReads.push({
                    source: 'comp',
                    filePath,
                    row: line,
                    colStart,
                    colEnd,
                    flagId,
                });
            }
        } else if (ts.isClassDeclaration(node)) {
            const decoratorArg = getAngularComponentMetadataFromDecorators(node);
            if (decoratorArg) {
                const template = getTemplateFromComponentMetadata(
                    ctx,
                    typeChecker,
                    filePath,
                    decoratorArg
                );
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
                        let colStart = tfr.offset;
                        if (templateLine.line) {
                            row = templateLine.row;
                            colStart = templateLine.col;
                        }
                        flagReads.push({
                            source: tfr.source,
                            filePath: tfr.filePath,
                            row,
                            colStart,
                            colEnd: colStart + tfr.length,
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

    const data = extractStringLiteralValue(typeChecker, node.argumentExpression);
    if (!data) {
        ctx.logger.warn(
            `unable to extract flag ID from element access of 'LDFlagSet': \`\`\` ${node.argumentExpression.getText()} \`\`\``
        );
        return null;
    }

    return data.value;
}

function getTemplateFromComponentMetadata(
    ctx: Context,
    typeChecker: ts.TypeChecker,
    filePath: string,
    metadata: ts.ObjectLiteralExpression
): TemplateMetadata | null {
    for (const prop of metadata.properties) {
        if (ts.isPropertyAssignment(prop) && isObjectKeyAndEquals(prop.name, 'template')) {
            return getInlineTemplateFromComponentMetadata(
                ctx,
                typeChecker,
                filePath,
                prop.initializer
            );
        } else if (
            ts.isShorthandPropertyAssignment(prop) &&
            isObjectKeyAndEquals(prop.name, 'template')
        ) {
            return getInlineTemplateFromComponentMetadata(ctx, typeChecker, filePath, prop);
        } else if (
            ts.isPropertyAssignment(prop) &&
            isObjectKeyAndEquals(prop.name, 'templateUrl')
        ) {
            return getExternalTemplateFromComponentMetadata(
                ctx,
                typeChecker,
                filePath,
                prop.initializer
            );
        } else if (
            ts.isShorthandPropertyAssignment(prop) &&
            isObjectKeyAndEquals(prop.name, 'templateUrl')
        ) {
            return getExternalTemplateFromComponentMetadata(ctx, typeChecker, filePath, prop.name);
        }
    }

    return null;
}

const TEMPLATE_INITIALIZER_RE = /^\s*['"`]/s;

function getInlineTemplateFromComponentMetadata(
    ctx: Context,
    typeChecker: ts.TypeChecker,
    filePath: string,
    node: ts.Node
): TemplateMetadata | null {
    const data = extractStringLiteralValue(typeChecker, node);

    if (data) {
        const beforeInitializer =
            data.node.getFullText().match(TEMPLATE_INITIALIZER_RE)?.[0].length ?? 0;
        const offset = data.node.getFullStart() + beforeInitializer;

        return {
            kind: 'inline',
            path: filePath,
            content: data.value,
            offset,
        };
    } else {
        ctx.logger.warn(`inline template is not a string literal in component: ${filePath}`);
        return null;
    }
}

function getExternalTemplateFromComponentMetadata(
    ctx: Context,
    typeChecker: ts.TypeChecker,
    filePath: string,
    node: ts.Node
): TemplateMetadata | null {
    const data = extractStringLiteralValue(typeChecker, node);
    if (!data) {
        ctx.logger.warn(`template URL is not a string literal in component: ${filePath}`);
        return null;
    }

    try {
        // Resolve the template path relative to the component
        const componentDir = path.dirname(filePath);
        const templatePath = path.resolve(componentDir, data.value);

        try {
            const content = fs.readFileSync(templatePath, 'utf-8');
            return {
                kind: 'external',
                path: templatePath,
                content,
                offset: 0,
            };
        } catch (err) {
            if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
                ctx.logger.warn(`template URL file not found for component: ${filePath}`);
                return null;
            } else {
                throw err;
            }
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : `${error}`;
        throw new Error(`Failed to read template file for component: ${filePath}\n\n${message}`);
    }
}
