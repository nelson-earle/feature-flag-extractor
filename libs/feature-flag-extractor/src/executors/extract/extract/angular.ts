import { ExecutorContext } from '@nx/devkit';
import { FlagRead } from '.';
import * as path from 'node:path';
import * as ng from '@angular/compiler';

export function extractFeatureFlagsFromTemplate(
    ctx: ExecutorContext,
    projectPath: string,
    templateUrl: string,
    template: string
): FlagRead[] {
    const parsedTemplate = parseTemplate(template, templateUrl);

    const filePath = templateUrl.replace(/^file:\/\//, '');
    const filePathRelative = path.relative(projectPath, filePath);
    const visitor = new FeatureFlagVisitor(filePathRelative);

    for (const node of parsedTemplate.nodes) {
        node.visit(visitor);
    }

    return visitor.getFlagReads();
}

/**
 * Parse an Angular template into an AST
 */
function parseTemplate(template: string, templateUrl: string): ng.ParsedTemplate {
    try {
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
    private flagReads: FlagRead[] = [];

    private exprVisitor: ng.AstVisitor;

    constructor(filePathRelative: string) {
        super();
        this.exprVisitor = new FeatureFlagAstVisitor(filePathRelative, this.flagReads);
    }

    getFlagReads(): FlagRead[] {
        return this.flagReads;
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
    private readonly filePathRelative: string;
    private readonly flagReads: FlagRead[];

    constructor(filePathRelative: string, flagReads: FlagRead[]) {
        super();
        this.filePathRelative = filePathRelative;
        this.flagReads = flagReads;
    }

    private addFlagRead(ast: ng.AST, flagId: string) {
        const strippedFlagId = flagId.replace(/["']/g, '');
        // TODO: fix span location to be the actual row/col in the source instead of byte offset
        // start/end.
        this.flagReads.push({
            kind: 'template',
            filePathRelative: this.filePathRelative,
            row: ast.sourceSpan.start,
            col: ast.sourceSpan.end,
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
        let flagId: string | null = null;

        if (ast.key instanceof ng.LiteralPrimitive && typeof ast.key.value === 'string') {
            if (ast.receiver instanceof ng.PropertyRead) {
                flagId = ast.key.value;
            } else if (ast.receiver instanceof ng.Call) {
                const callReceiver = ast.receiver.receiver;
                if (callReceiver instanceof ng.PropertyRead) {
                    flagId = ast.key.value;
                }
            }
        }

        if (flagId) {
            // TODO: check if the receiver is in the flag properties set
            this.addFlagRead(ast, flagId);
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
        let flagId: string | null = null;

        if (ast.key instanceof ng.LiteralPrimitive && typeof ast.key.value === 'string') {
            if (ast.receiver instanceof ng.PropertyRead) {
                flagId = ast.key.value;
            } else if (ast.receiver instanceof ng.Call) {
                const callReceiver = ast.receiver.receiver;
                if (callReceiver instanceof ng.PropertyRead) {
                    flagId = ast.key.value;
                }
            }
        }

        if (flagId) {
            // TODO: check if the receiver is in the flag properties set
            this.addFlagRead(ast, flagId);
        } else {
            super.visitSafeKeyedRead(ast, ctx);
        }
    }
}
