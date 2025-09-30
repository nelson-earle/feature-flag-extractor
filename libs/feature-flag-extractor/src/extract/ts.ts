import * as ts from 'typescript';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FlagRead } from '.';
import { BuilderContext } from '@angular-devkit/architect';
import { extractFeatureFlagsFromTemplate } from './angular';

export function extractFeatureFlagsFromTs(
    ctx: BuilderContext,
    projectPath: string,
    typeChecker: ts.TypeChecker,
    sourceFile: ts.SourceFile,
    filePath: string
): FlagRead[] {
    const flagReads: FlagRead[] = [];

    const visit = (node: ts.Node): void => {
        if (ts.isElementAccessExpression(node)) {
            const flag = extractFlagFromElementAccess(typeChecker, node);

            if (flag) {
                const { line, character } = sourceFile.getLineAndCharacterOfPosition(
                    node.getStart()
                );
                const relativePath = path.relative(projectPath, sourceFile.fileName);
                flagReads.push({
                    kind: 'ts',
                    filePathRelative: relativePath,
                    row: line,
                    col: character + 1,
                    flagId: flag,
                });
            }
        } else if (
            ts.isDecorator(node) &&
            ts.isCallExpression(node.expression) &&
            ts.isIdentifier(node.expression.expression) &&
            node.expression.expression.text === 'Component'
        ) {
            // Extract the first component decorator argument
            const decoratorArg = node.expression.arguments[0];
            if (decoratorArg && ts.isObjectLiteralExpression(decoratorArg)) {
                const template = getTemplateFromComponentMetadata(ctx, filePath, decoratorArg);
                ctx.logger.info(`--------------------------------------------------`);
                ctx.logger.info(`COMPONENT TEMPLATE: ${filePath}`);
                if (template) {
                    const templateUrl = `file://${filePath}`;
                    const templateFlagReads = extractFeatureFlagsFromTemplate(
                        ctx,
                        projectPath,
                        typeChecker,
                        templateUrl,
                        template
                    );
                    flagReads.push(...templateFlagReads);
                } else {
                    ctx.logger.info('[none]');
                }
            }
        }

        ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);

    return flagReads;
}

/**
 * Extract the flag ID from an element access expression.
 * @param node The element access expression node.
 * @returns The flag ID or null if the node doesn't match our criteria.
 */
function extractFlagFromElementAccess(
    typeChecker: ts.TypeChecker,
    node: ts.ElementAccessExpression
): string | null {
    // Check receiver (object being accessed)
    const receiverIsValid =
        ts.isPropertyAccessExpression(node.expression) ||
        ts.isIdentifier(node.expression) ||
        ts.isCallExpression(node.expression);
    if (!receiverIsValid) return null;

    // Check key (property being accessed)
    const keyIsValid =
        ts.isStringLiteral(node.argumentExpression) ||
        ts.isPropertyAccessExpression(node.argumentExpression) ||
        ts.isIdentifier(node.argumentExpression);
    if (!keyIsValid) return null;

    // Get the type of the receiver
    const receiverType = typeChecker.getTypeAtLocation(node.expression);
    const receiverTypeString = typeChecker.typeToString(receiverType);

    // Check if the receiver is an LDFlagSet
    const receiverIsLDFlagSet =
        receiverTypeString.includes('LDFlagSet') ||
        (receiverType.symbol && receiverType.symbol.name === 'LDFlagSet');

    if (!receiverIsLDFlagSet) return null;

    // Extract the flag ID
    let flag: string | null = null;

    if (ts.isStringLiteral(node.argumentExpression)) {
        // Direct string literal like `flags['feature']`
        flag = node.argumentExpression.getText();
    } else {
        // Handle property reads like `flags[FEATURE_FLAG]`
        const keyType = typeChecker.getTypeAtLocation(node.argumentExpression);
        const keyTypeString = typeChecker.typeToString(keyType);

        if (keyTypeString.startsWith('"')) {
            // Key is a string literal
            flag = keyTypeString;
        } else if (
            ts.isIdentifier(node.argumentExpression) ||
            ts.isPropertyAccessExpression(node.argumentExpression)
        ) {
            // Try to find the literal value from symbol declaration
            flag = extractDynamicFlag(typeChecker, node.argumentExpression);
        } else if (keyTypeString !== 'string') {
            // Neither a string literal or an identifier/property read
            console.warn(
                `Found read of 'LDFlagSet' with key of unsupported type: ${keyTypeString}`
            );
        }
    }

    if (!flag) {
        console.warn(`Unable to get flag ID for 'LDFlagSet' read: ${node.getText()}`);
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
        const declaration = symbol.declarations[0];
        // Check if it's a variable declaration with initializer
        if (
            (ts.isVariableDeclaration(declaration) || ts.isPropertyDeclaration(declaration)) &&
            declaration.initializer
        ) {
            if (ts.isStringLiteral(declaration.initializer)) {
                return declaration.initializer.getText();
            }
        }
    }

    return null;
}

function getTemplateFromComponentMetadata(
    ctx: BuilderContext,
    filePath: string,
    metadata: ts.ObjectLiteralExpression
): string | null {
    for (const prop of metadata.properties) {
        if (ts.isPropertyAssignment(prop)) {
            if (isObjectKeyAndEquals(prop.name, 'template')) {
                if (
                    ts.isStringLiteral(prop.initializer) ||
                    ts.isNoSubstitutionTemplateLiteral(prop.initializer)
                ) {
                    return prop.initializer.text;
                } else {
                    ctx.logger.warn(
                        `Inline template is not a string literal in component: ${filePath}`
                    );
                    return null;
                }
                // TODO: handle initializer that is an identifier of a constant.
            } else if (isObjectKeyAndEquals(prop.name, 'templateUrl')) {
                if (
                    !ts.isStringLiteral(prop.initializer) &&
                    !ts.isNoSubstitutionTemplateLiteral(prop.initializer)
                ) {
                    ctx.logger.warn(
                        `Template URL is not a string literal for component: ${filePath}`
                    );
                    return null;
                }
                // TODO: handle initializer that is an identifier of a constant.

                const templateUrl = prop.initializer.text;

                try {
                    // Resolve the template path relative to the component
                    const componentDir = path.dirname(filePath);
                    const templatePath = path.resolve(componentDir, templateUrl);

                    // TODO: just try to read and detect ENOTFOUND
                    if (fs.existsSync(templatePath)) {
                        return fs.readFileSync(templatePath, 'utf-8');
                    } else {
                        ctx.logger.warn(`Template file not found for component: ${filePath}`);
                        return null;
                    }
                } catch (error) {
                    ctx.logger.error(
                        `Failed to read template file for component: ${filePath}\n${(error as Error).message}`
                    );
                    return null;
                }
            }
        }
    }

    return null;
}

function isObjectKeyAndEquals(node: ts.PropertyName, value: string): boolean {
    return (ts.isIdentifier(node) || ts.isStringLiteral(node)) && node.text === value;
}
