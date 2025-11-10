import { ExecutorContext } from '@nx/devkit';
import { FlagRead } from '.';
import * as path from 'node:path';
import * as ng from '@angular/compiler';
import { AngularTemplateTypeResolver } from './angular-template-type-resolver';
import * as ts from 'typescript';
import { typeContainsSymbol } from '../ts-util';

interface TemplateKeyedRead {
    receiverStart: number;
    receiverEnd: number;
    flagId: string;
}

export function extractFeatureFlagsFromTemplate(
    ctx: ExecutorContext,
    rootPath: string,
    typeChecker: ts.TypeChecker,
    templateTypeResolver: AngularTemplateTypeResolver,
    templateUrl: string,
    template: string,
    templateOffset: number
): FlagRead[] {
    const parsedTemplate = parseTemplate(template, templateUrl);

    const filePath = templateUrl.replace(/^file:\/\//, '');
    const filePathRelative = path.relative(rootPath, filePath);
    const visitor = new FeatureFlagVisitor();

    for (const node of parsedTemplate.nodes) {
        node.visit(visitor);
    }

    const keyedReads: FlagRead[] = [];

    for (const keyedRead of visitor.getKeyedReads()) {
        console.log(
            `KEYED READ: ${template.slice(keyedRead.receiverStart, keyedRead.receiverEnd)}`
        );
        const receiverType = templateTypeResolver.resolveType(
            filePathRelative,
            templateOffset + keyedRead.receiverStart,
            templateOffset + keyedRead.receiverEnd
        );
        const receiverTypeContainsLDFlagSet = typeContainsSymbol(
            typeChecker,
            receiverType,
            'LDFlagSet'
        );
        if (receiverTypeContainsLDFlagSet) {
            // TODO: convert offset into correct row & col
            keyedReads.push({
                kind: 'template',
                filePathRelative,
                row: 0,
                col: templateOffset + keyedRead.receiverStart,
                flagId: keyedRead.flagId,
            });
        }
    }

    return keyedReads;
}

/**
 * Parse an Angular template into an AST
 */
function parseTemplate(template: string, templateUrl: string): ng.ParsedTemplate {
    try {
        // TODO: take the absolute template file path as an arg and turn it into a URL here
        const parsed = ng.parseTemplate(template, templateUrl, {
            enableBlockSyntax: true,
            enableLetSyntax: true,
            preserveWhitespaces: true,
            interpolationConfig: ng.DEFAULT_INTERPOLATION_CONFIG,
        });
        if (parsed.errors) {
            const errors = parsed.errors.map(e => `- ${e.toString()}`).join('\n');
            throw new Error(`Failed to parse template: ${templateUrl}:\n${errors}`);
        }
        return parsed;
    } catch (e) {
        throw new Error(`Failed to parse template: ${templateUrl}`, { cause: e });
    }
}

class FeatureFlagVisitor extends ng.TmplAstRecursiveVisitor {
    private keyedReads: TemplateKeyedRead[] = [];

    private exprVisitor: ng.AstVisitor;

    constructor() {
        super();
        this.exprVisitor = new FeatureFlagAstVisitor(this.keyedReads);
    }

    getKeyedReads(): TemplateKeyedRead[] {
        return this.keyedReads;
    }

    ctx(): FeatureFlagAstVisitorContext {
        return;
    }

    /**
     * ## Examples
     *
     * ```
     * @switch (<expr>) { ... }
     * ```
     */
    override visitSwitchBlock(block: ng.TmplAstSwitchBlock): void {
        block.expression.visit(this.exprVisitor, this.ctx());
        super.visitSwitchBlock(block);
    }

    /**
     * ## Examples
     *
     * ```
     * <!-- Must be wrapped by an `@switch` -->
     * @case { ... }
     * @case (<expr>) { ... }
     * ```
     */
    override visitSwitchBlockCase(block: ng.TmplAstSwitchBlockCase): void {
        block.expression?.visit(this.exprVisitor, this.ctx());
        super.visitSwitchBlockCase(block);
    }

    /**
     * ## Examples
     *
     * ```
     * <!-- Has an expression -->
     * @if (<expr>) { ... }
     * ```
     *
     * ```
     * <!-- Has an expression -->
     * @else if (<expr>) { ... }
     * ```
     *
     * ```
     * <!-- Does not have an expression -->
     * @else { ... }
     * ```
     */
    override visitIfBlockBranch(block: ng.TmplAstIfBlockBranch): void {
        block.expression?.visit(this.exprVisitor, this.ctx());
        super.visitIfBlockBranch(block);
    }

    /**
     * ## Examples
     *
     * ```
     * <div [class.invalid]="invalid"></div>
     * ```
     */
    override visitBoundAttribute(attribute: ng.TmplAstBoundAttribute): void {
        attribute.value.visit(this.exprVisitor, this.ctx());
        super.visitBoundAttribute(attribute);
    }

    /**
     * ## Examples
     *
     * ```
     * <button (click)="onClick()"></button>
     * ```
     */
    override visitBoundEvent(event: ng.TmplAstBoundEvent): void {
        event.handler.visit(this.exprVisitor, this.ctx());
        super.visitBoundEvent(event);
    }

    /**
     * ## Examples
     *
     * ```
     * <p>{{ text }}</p>
     * ```
     */
    override visitBoundText(text: ng.TmplAstBoundText): void {
        text.value.visit(this.exprVisitor, this.ctx());
        super.visitBoundText(text);
    }

    /**
     * ## Examples
     *
     * ```
     * @let flags = featureFlags();
     * ```
     */
    override visitLetDeclaration(decl: ng.TmplAstLetDeclaration): void {
        decl.value.visit(this.exprVisitor, this.ctx());
        super.visitLetDeclaration(decl);
    }
}

type FeatureFlagAstVisitorContext = unknown;

type FeatureFlagAstVisitorResult = void;

class FeatureFlagAstVisitor extends ng.RecursiveAstVisitor {
    private readonly keyedReads: TemplateKeyedRead[];

    constructor(keyedReads: TemplateKeyedRead[]) {
        super();
        this.keyedReads = keyedReads;
    }

    private addKeyedRead(receiver: ng.AST, key: string) {
        const strippedFlagId = key.replace(/["']/g, '');
        // TODO: fix span location to be the actual row/col in the source instead of byte offset
        // start/end.
        this.keyedReads.push({
            receiverStart: receiver.sourceSpan.start,
            receiverEnd: receiver.sourceSpan.end,
            flagId: strippedFlagId,
        });
    }

    /**
     * ## Examples
     *
     * ```
     * featureFlags['flag-id']
     * ```
     */
    override visitKeyedRead(
        ast: ng.KeyedRead,
        ctx: FeatureFlagAstVisitorContext
    ): FeatureFlagAstVisitorResult {
        if (ast.key instanceof ng.LiteralPrimitive && typeof ast.key.value === 'string') {
            this.addKeyedRead(ast.receiver, ast.key.value);
        } else {
            super.visitKeyedRead(ast, ctx);
        }
    }

    /**
     * ## Examples
     *
     * ```
     * featureFlags?.['flag-id']
     * ```
     */
    override visitSafeKeyedRead(
        ast: ng.SafeKeyedRead,
        ctx: FeatureFlagAstVisitorContext
    ): FeatureFlagAstVisitorResult {
        if (ast.key instanceof ng.LiteralPrimitive && typeof ast.key.value === 'string') {
            this.addKeyedRead(ast.receiver, ast.key.value);
        } else {
            super.visitSafeKeyedRead(ast, ctx);
        }
    }
}
