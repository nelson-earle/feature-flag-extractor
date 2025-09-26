import * as ts from 'typescript';
import * as path from 'node:path';
import { FlagRead } from '.';

export function extractFeatureFlagsFromTs(
    projectPath: string,
    typeChecker: ts.TypeChecker,
    sourceFile: ts.SourceFile
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
                    filePathRelative: relativePath,
                    row: line,
                    col: character,
                    flagId: flag,
                });
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
