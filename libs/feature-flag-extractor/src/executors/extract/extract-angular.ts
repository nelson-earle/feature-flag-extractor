import { Context } from './models/context';
import { FlagReadSource } from './models/flag-read';
import * as ng from '@angular/compiler';
import { ProjectService } from './project-service';
import { typeContainsSymbol } from './ts-util';

export interface TemplateMetadata {
    kind: 'inline' | 'external';
    path: string;
    content: string;
    offset: number;
}

interface TemplateKeyedRead {
    exprSpan: ng.AbsoluteSourceSpan;
    receiverSpan: ng.AbsoluteSourceSpan;
    keySpan: ng.AbsoluteSourceSpan;
    flagId: string;
}

export interface TemplateFlagRead {
    source: FlagReadSource;
    filePath: string;
    offset: number;
    flagId: string;
}

export function extractFeatureFlagsFromTemplate(
    ctx: Context,
    projectService: ProjectService,
    template: TemplateMetadata
): TemplateFlagRead[] {
    const typeChecker = projectService.getTypeChecker();

    const parsedTemplate = parseTemplate(`file://${template.path}`, template.content);

    const visitor = new FeatureFlagVisitor();

    for (const node of parsedTemplate.nodes) {
        node.visit(visitor);
    }

    const keyedReads: TemplateFlagRead[] = [];

    for (const keyedRead of visitor.getKeyedReads()) {
        // ctx.logger.debug(
        //     `TEST [src=TMPL] keyed read: \`\`\` ${template.substring(keyedRead.exprSpan.start, keyedRead.exprSpan.end)} \`\`\``
        // );

        const start = template.offset + keyedRead.receiverSpan.start;
        const end = template.offset + keyedRead.receiverSpan.end;

        const receiverType = projectService.resolveTypeInTemplateAtPosition(
            template.path,
            start,
            end
        );
        const receiverTypeContainsLDFlagSet = typeContainsSymbol(
            typeChecker,
            receiverType,
            'LDFlagSet'
        );

        if (receiverTypeContainsLDFlagSet) {
            const text = template.content.substring(
                keyedRead.exprSpan.start,
                keyedRead.exprSpan.end
            );
            ctx.logger.debug(`>>> EXTRACT [src=TMPL] flag read: \`\`\` ${text} \`\`\``);

            keyedReads.push({
                source: 'tmpl',
                filePath: template.path,
                offset: template.offset + keyedRead.keySpan.start,
                flagId: keyedRead.flagId,
            });
        }
    }

    return keyedReads;
}

/**
 * Parse an Angular template into an AST
 */
function parseTemplate(templateUrl: string, template: string): ng.ParsedTemplate {
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
     * Override to fix bug where `TmplAstRecursiveVisitor.visitTemplate`
     * doesn't visit the `templateAttrs` of the `TmplAstTemplate`.
     *
     * TODO: this override is not needed once we can upgrade this class to be
     * `extends ng.CombinedRecursiveAstVisitor` (exported name TBD), introduced
     * in Angular 20.1.x. See [1] for implementation.
     *
     * [1]: https://github.com/angular/angular/pull/61158
     */
    override visitTemplate(template: ng.TmplAstTemplate): void {
        ng.tmplAstVisitAll(this, template.attributes);
        ng.tmplAstVisitAll(this, template.inputs);
        ng.tmplAstVisitAll(this, template.outputs);
        ng.tmplAstVisitAll(this, template.templateAttrs); // missing in original impl
        ng.tmplAstVisitAll(this, template.children);
        ng.tmplAstVisitAll(this, template.references);
        ng.tmplAstVisitAll(this, template.variables);
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

    private addKeyedRead(
        expr: ng.AST,
        receiver: ng.AST,
        keySpan: ng.AbsoluteSourceSpan,
        key: string
    ) {
        const strippedFlagId = key.replace(/["']/g, '');
        this.keyedReads.push({
            exprSpan: expr.sourceSpan,
            receiverSpan: receiver.sourceSpan,
            keySpan,
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
            this.addKeyedRead(ast, ast.receiver, ast.key.sourceSpan, ast.key.value);
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
            this.addKeyedRead(ast, ast.receiver, ast.key.sourceSpan, ast.key.value);
        } else {
            super.visitSafeKeyedRead(ast, ctx);
        }
    }
}
