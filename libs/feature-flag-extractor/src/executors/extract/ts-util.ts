import * as ts from 'typescript';

export function isStaticString(
    node: ts.Node
): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
    return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

export function isObjectKeyAndEquals(node: ts.PropertyName, value: string): boolean {
    return (ts.isIdentifier(node) || ts.isStringLiteral(node)) && node.text === value;
}

export function typeContainsSymbol(
    typeChecker: ts.TypeChecker,
    type: ts.Type,
    symbol: string
): boolean {
    if (type.isUnionOrIntersection()) {
        return type.types.some(t => typeContainsSymbol(typeChecker, t, symbol));
    } else {
        return type.getSymbol()?.name === symbol;
    }
}
