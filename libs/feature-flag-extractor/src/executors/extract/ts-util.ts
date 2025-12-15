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
