import * as ts from 'typescript';

export function isObjectKeyAndEquals(node: ts.PropertyName, value: string): boolean {
    return (ts.isIdentifier(node) || ts.isStringLiteral(node)) && node.text === value;
}

export function typeContainsSymbol(
    typeChecker: ts.TypeChecker,
    type: ts.Type,
    symbol: string
): boolean {
    return typeChecker.typeToString(type).includes(symbol);
}

export function extractStringLiteralValue(
    typeChecker: ts.TypeChecker,
    node: ts.Node
): { node: ts.Node; value: string } | null {
    if (ts.isStringLiteralLike(node)) {
        return { node, value: node.text };
    } else if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
        const symbol = typeChecker.getSymbolAtLocation(node);
        if (symbol && symbol.declarations && symbol.declarations[0]) {
            return extractStringLiteralValue(typeChecker, symbol.declarations[0]);
        }
    } else if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.initializer)) {
        // e.g. `{ value: ... }`
        const symbol = typeChecker.getSymbolAtLocation(node);
        if (symbol && symbol.declarations && symbol.declarations[0]) {
            return extractStringLiteralValue(typeChecker, symbol.declarations[0]);
        }
    } else if (ts.isShorthandPropertyAssignment(node)) {
        // e.g. `{ value }`
        const symbol = typeChecker.getShorthandAssignmentValueSymbol(node);
        if (symbol && symbol.valueDeclaration) {
            return extractStringLiteralValue(typeChecker, symbol.valueDeclaration);
        }
    } else if (
        ts.isVariableDeclaration(node) ||
        ts.isPropertyAssignment(node) ||
        ts.isPropertyDeclaration(node)
    ) {
        // Check if it's a variable declaration with initializer
        // VariableDeclaration:
        //     const name = ...;
        // PropertyAssignment:
        //     { name: ... }
        // PropertyDeclaration:
        //     class { name = ...; }
        if (node.initializer) {
            return extractStringLiteralValue(typeChecker, node.initializer);
        }
    }

    return null;
}
