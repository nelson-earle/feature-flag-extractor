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
    ctx.logger.info('--------------------------------------------------');
    ctx.logger.info(`----- ${filePath}`);
    ctx.logger.info('--------------------------------------------------');
    const flagReads: FlagRead[] = [];

    const visit = (node: ts.Node): void => {
        if (ts.isElementAccessExpression(node)) {
            const flag = extractFlagFromElementAccess(ctx, typeChecker, node);

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
        } else if (ts.isClassDeclaration(node)) {
            const flagProps = getFlagSetsFromComponentClassDeclaration(typeChecker, node);
            for (const prop of flagProps.values()) {
                console.log(`--- PROP [${prop.kind.padStart(8, ' ')}] ${prop.name}: ${prop.type}`);
            }
            const decoratorArg = getAngularComponentMetadataFromNodeDecorators(node);
            if (decoratorArg) {
                const template = getTemplateFromComponentMetadata(ctx, filePath, decoratorArg);
                if (template) {
                    const templateUrl = `file://${filePath}`;
                    const templateFlagReads = extractFeatureFlagsFromTemplate(
                        ctx,
                        projectPath,
                        templateUrl,
                        template
                    );
                    flagReads.push(...templateFlagReads);
                }
            }
        }

        ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);

    return flagReads;
}

interface FeatureFlagProperty {
    kind: 'property' | 'method' | 'async';
    name: string;
    type: string;
}

const ASYNC_PIPABLE_LDFLAGSET_RE =
    /^(Observable|Subscribable|BehaviorSubject|Subject|PromiseLike|Promise)<LDFlagSet>$/;

function getFlagSetsFromComponentClassDeclaration(
    typeChecker: ts.TypeChecker,
    classDecl: ts.ClassDeclaration
): Map<string, FeatureFlagProperty> {
    const classType = typeChecker.getTypeAtLocation(classDecl);

    const flagSetProperties = new Map<string, FeatureFlagProperty>();

    for (const field of classType.getProperties()) {
        const type = typeChecker.getTypeOfSymbolAtLocation(field, classDecl);
        const typeString = typeChecker.typeToString(type);

        if (typeString === 'LDFlagSet') {
            // Property is a flag set.
            flagSetProperties.set(field.name, {
                kind: 'property',
                name: field.name,
                type: typeString,
            });
        } else if (ASYNC_PIPABLE_LDFLAGSET_RE.test(typeString)) {
            // Property is an async-pipable flag set.
            flagSetProperties.set(field.name, {
                kind: 'async',
                name: field.name,
                type: typeString,
            });
        } else {
            const signatures = type.getCallSignatures();
            if (signatures.length > 0) {
                // Property is function-like.
                for (const sig of signatures) {
                    const returnType = sig.getReturnType();
                    const returnTypeString = typeChecker.typeToString(returnType);
                    if (returnTypeString === 'LDFlagSet') {
                        flagSetProperties.set(field.name, {
                            kind: 'method',
                            name: field.name,
                            type: typeString,
                        });
                        break;
                    }
                }
            }
        }
    }

    return flagSetProperties;
}

function getAngularComponentMetadataFromNodeDecorators(
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
    ctx: BuilderContext,
    typeChecker: ts.TypeChecker,
    node: ts.ElementAccessExpression
): string | null {
    const receiverType = typeChecker.getTypeAtLocation(node.expression);

    const receiverTypeContainsLDFlagSet = typeContainsSymbol(
        typeChecker,
        receiverType,
        'LDFlagSet'
    );
    if (!receiverTypeContainsLDFlagSet) {
        return null;
    }

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
        } else if (keyTypeString !== 'string') {
            // Neither a string literal or an identifier/property read
            ctx.logger.warn(
                `Found read of 'LDFlagSet' with key of unsupported type: ${keyTypeString}`
            );
        }
    }

    if (!flag) {
        ctx.logger.warn(`Unable to get flag ID for 'LDFlagSet' read: ${node.getText()}`);
    }

    return flag;
}

function typeContainsSymbol(typeChecker: ts.TypeChecker, type: ts.Type, symbol: string): boolean {
    if (type.isUnionOrIntersection()) {
        return type.types.some(t => typeContainsSymbol(typeChecker, t, symbol));
    } else {
        return type.getSymbol()?.name === symbol;
    }
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

function getTemplateFromComponentMetadata(
    ctx: BuilderContext,
    filePath: string,
    metadata: ts.ObjectLiteralExpression
): string | null {
    for (const prop of metadata.properties) {
        if (ts.isPropertyAssignment(prop)) {
            if (isObjectKeyAndEquals(prop.name, 'template')) {
                if (isStaticString(prop.initializer)) {
                    return prop.initializer.text;
                } else {
                    ctx.logger.warn(
                        `Inline template is not a string literal in component: ${filePath}`
                    );
                    return null;
                }
                // TODO: handle initializer that is an identifier of a constant.
            } else if (isObjectKeyAndEquals(prop.name, 'templateUrl')) {
                if (!isStaticString(prop.initializer)) {
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

function isStaticString(
    node: ts.Node
): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
    return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function isObjectKeyAndEquals(node: ts.PropertyName, value: string): boolean {
    return (ts.isIdentifier(node) || ts.isStringLiteral(node)) && node.text === value;
}
