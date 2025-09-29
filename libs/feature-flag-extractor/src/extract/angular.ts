import { BuilderContext } from '@angular-devkit/architect';
import { FlagRead } from '.';
import * as path from 'node:path';
import * as ts from 'typescript';
import * as ng from '@angular/compiler';

export function extractFeatureFlagsFromTemplate(
    ctx: BuilderContext,
    projectPath: string,
    typeChecker: ts.TypeChecker,
    templateUrl: string,
    template: string
): FlagRead[] {
    const flagReads: FlagRead[] = [];

    const parsedTemplate = parseTemplate(ctx, template, templateUrl);
    if (!parsedTemplate) return flagReads;

    const filePath = templateUrl.replace(/^file:\/\//, '');
    const filePathRelative = path.relative(projectPath, filePath);
    const visitor = new FeatureFlagVisitor(typeChecker, filePathRelative, flagReads);

    for (const node of parsedTemplate.nodes) {
        node.visit<FeatureFlagVisitorResult>(visitor);
    }

    return flagReads;
}

/**
 * Parse an Angular template into an AST
 */
function parseTemplate(
    ctx: BuilderContext,
    template: string,
    templateUrl: string
): ng.ParsedTemplate | null {
    try {
        const parsed = ng.parseTemplate(template, templateUrl, {
            enableBlockSyntax: true,
            enableLetSyntax: true,
            preserveWhitespaces: true,
            interpolationConfig: ng.DEFAULT_INTERPOLATION_CONFIG,
        });
        if (parsed.errors) {
            ctx.logger.error(`Failed to parse template at ${templateUrl}:`);
            for (const error of parsed.errors) {
                ctx.logger.error(error.toString());
            }
            return null;
        }
        return parsed;
    } catch (e) {
        console.error(`Failed to parse template at ${templateUrl}:`, e);
        return null;
    }
}

type FeatureFlagVisitorResult = void;

/**
 * Visitor class that extracts feature flag accesses from Angular templates
 *
 */
class FeatureFlagVisitor implements ng.TmplAstVisitor<FeatureFlagVisitorResult> {
    private readonly astVisitor: FeatureFlagAstVisitor;

    constructor(typeChecker: ts.TypeChecker, filePathRelative: string, flagReads: FlagRead[]) {
        this.astVisitor = new FeatureFlagAstVisitor(typeChecker, filePathRelative, flagReads);
    }

    private ctx(): FeatureFlagAstVisitorContext {
        return;
    }

    private visitAst(
        node: ng.ASTWithSource,
        ctx: FeatureFlagAstVisitorContext
    ): FeatureFlagVisitorResult {
        return node.visit(this.astVisitor, ctx);
    }

    //#region ng.TmplAstVisitor

    // visit?(node: Node): Result;

    visitElement(element: ng.TmplAstElement): FeatureFlagVisitorResult {
        // Visit all inputs (property bindings)
        for (const input of element.inputs) {
            const value = input.value;
            if (value instanceof ng.ASTWithSource) {
                this.visitAst(value, this.ctx());
            }
        }

        // Visit all outputs (event bindings)
        for (const output of element.outputs) {
            const handler = output.handler;
            if (handler instanceof ng.ASTWithSource) {
                this.visitAst(handler, this.ctx());
            }
        }

        // // Visit attributes (e.g. `alt="description"`)
        // for (const attr of element.attributes) {
        //     // Attributes are strings and therefore can't contain feature flags.
        // }

        // // Visit template references (e.g. `#ref`)
        // for (const _ref of element.references) {
        //     // References are identifiers and therefore can't contain feature flags.
        // }

        // Recursively visit children
        for (const child of element.children) {
            child.visit<FeatureFlagVisitorResult>(this);
        }
    }

    visitTemplate(template: ng.TmplAstTemplate): FeatureFlagVisitorResult {
        for (const attr of template.templateAttrs) {
            // Template attributes might contain feature flags in their bindings
        }

        for (const input of template.inputs) {
            if (input.value instanceof ng.ASTWithSource) {
                this.visitAst(input.value, this.ctx());
            }
        }

        for (const output of template.outputs) {
            if (output.handler instanceof ng.ASTWithSource) {
                this.visitAst(output.handler, this.ctx());
            }
        }

        for (const child of template.children) {
            child.visit<FeatureFlagVisitorResult>(this);
        }
    }

    visitContent(content: ng.TmplAstContent): FeatureFlagVisitorResult {
        // Content projection, usually doesn't contain feature flags directly
    }

    visitVariable(variable: ng.TmplAstVariable): FeatureFlagVisitorResult {
        // Template variables, usually don't contain feature flags
    }

    visitReference(reference: ng.TmplAstReference): FeatureFlagVisitorResult {
        // References usually don't contain feature flags
    }

    visitTextAttribute(attribute: ng.TmplAstTextAttribute): FeatureFlagVisitorResult {
        // Static text attributes usually don't contain feature flags
    }

    visitBoundAttribute(attribute: ng.TmplAstBoundAttribute): FeatureFlagVisitorResult {
        const value = attribute.value;
        if (value instanceof ng.ASTWithSource) {
            this.visitAst(value, this.ctx());
        }
    }

    visitBoundEvent(event: ng.TmplAstBoundEvent): FeatureFlagVisitorResult {
        const handler = event.handler;
        if (handler instanceof ng.ASTWithSource) {
            this.visitAst(handler, this.ctx());
        }
    }

    visitText(text: ng.TmplAstText): FeatureFlagVisitorResult {
        // Static text doesn't contain feature flags
    }

    visitBoundText(text: ng.TmplAstBoundText): FeatureFlagVisitorResult {
        if (text.value instanceof ng.ASTWithSource) {
            this.visitAst(text.value, this.ctx());
        }
    }

    visitIcu(icu: ng.TmplAstIcu): FeatureFlagVisitorResult {
        // ICU expressions might contain feature flags
        // Parse ICU cases if needed
    }

    visitDeferredBlock(deferred: ng.TmplAstDeferredBlock): FeatureFlagVisitorResult {
        for (const child of deferred.children) {
            child.visit<FeatureFlagVisitorResult>(this);
        }
        if (deferred.placeholder) {
            for (const child of deferred.placeholder.children) {
                child.visit<FeatureFlagVisitorResult>(this);
            }
        }
        if (deferred.loading) {
            for (const child of deferred.loading.children) {
                child.visit<FeatureFlagVisitorResult>(this);
            }
        }
        if (deferred.error) {
            for (const child of deferred.error.children) {
                child.visit<FeatureFlagVisitorResult>(this);
            }
        }
    }

    visitDeferredBlockPlaceholder(
        block: ng.TmplAstDeferredBlockPlaceholder
    ): FeatureFlagVisitorResult {
        for (const child of block.children) {
            child.visit<FeatureFlagVisitorResult>(this);
        }
    }

    visitDeferredBlockError(block: ng.TmplAstDeferredBlockError): FeatureFlagVisitorResult {
        for (const child of block.children) {
            child.visit<FeatureFlagVisitorResult>(this);
        }
    }

    visitDeferredBlockLoading(block: ng.TmplAstDeferredBlockLoading): FeatureFlagVisitorResult {
        for (const child of block.children) {
            child.visit<FeatureFlagVisitorResult>(this);
        }
    }

    visitDeferredTrigger(_trigger: ng.TmplAstDeferredTrigger): FeatureFlagVisitorResult {
        return;
    }

    visitSwitchBlock(switchBlock: ng.TmplAstSwitchBlock): FeatureFlagVisitorResult {
        // Angular 17+ switch block
        if (switchBlock.expression instanceof ng.ASTWithSource) {
            this.visitAst(switchBlock.expression, this.ctx());
        }
        for (const case_ of switchBlock.cases) {
            if (case_.expression instanceof ng.ASTWithSource) {
                this.visitAst(case_.expression, this.ctx());
            }
            for (const child of case_.children) {
                child.visit<FeatureFlagVisitorResult>(this);
            }
        }
    }

    visitSwitchBlockCase(switchCase: ng.TmplAstSwitchBlockCase): FeatureFlagVisitorResult {
        for (const child of switchCase.children) {
            child.visit(this);
        }
    }

    visitForLoopBlock(block: ng.TmplAstForLoopBlock): FeatureFlagVisitorResult {
        // Angular 17+ for block
        if (block.expression instanceof ng.ASTWithSource) {
            this.visitAst(block.expression, this.ctx());
        }
        for (const child of block.children) {
            child.visit(this);
        }
        if (block.empty) {
            for (const child of block.empty.children) {
                child.visit(this);
            }
        }
    }

    visitForLoopBlockEmpty(block: ng.TmplAstForLoopBlockEmpty): FeatureFlagVisitorResult {
        for (const child of block.children) {
            child.visit(this);
        }
    }

    visitIfBlock(ifBlock: ng.TmplAstIfBlock): FeatureFlagVisitorResult {
        // Angular 17+ if block
        for (const branch of ifBlock.branches) {
            if (branch.expression instanceof ng.ASTWithSource) {
                this.visitAst(branch.expression, this.ctx());
            }
            for (const child of branch.children) {
                child.visit(this);
            }
        }
    }

    visitIfBlockBranch(branch: ng.TmplAstIfBlockBranch): FeatureFlagVisitorResult {
        for (const child of branch.children) {
            child.visit(this);
        }
    }

    visitUnknownBlock(_block: ng.TmplAstUnknownBlock): void {
        return;
    }

    visitLetDeclaration(decl: ng.TmplAstLetDeclaration): FeatureFlagVisitorResult {
        // Angular 17+ let declaration
        const value = decl.value;
        if (value instanceof ng.ASTWithSource) {
            this.visitAst(value, this.ctx());
        }
    }

    //#endregion ng.TmplAstVisitor
}

type FeatureFlagAstVisitorContext = unknown;

type FeatureFlagAstVisitorResult = void;

/**
 * Visitor for expressions inside bindings to find feature flag accesses
 */
class FeatureFlagAstVisitor implements ng.AstVisitor {
    private readonly typeChecker: ts.TypeChecker;
    private readonly filePathRelative: string;
    private readonly flagReads: FlagRead[];

    constructor(typeChecker: ts.TypeChecker, filePathRelative: string, flagReads: FlagRead[]) {
        this.typeChecker = typeChecker;
        this.filePathRelative = filePathRelative;
        this.flagReads = flagReads;
    }

    private addFlagRead(ast: ng.AST, flagId: string) {
        console.log(`FOUND FLAG: ${flagId}`);
        const strippedFlagId = flagId.replace(/["']/g, '');
        this.flagReads.push({
            kind: 'template',
            filePathRelative: this.filePathRelative,
            row: ast.sourceSpan.start,
            col: ast.sourceSpan.end,
            flagId: strippedFlagId,
        });
    }

    visitUnary?(ast: ng.Unary, ctx: FeatureFlagAstVisitorContext): FeatureFlagAstVisitorResult {
        ast.expr.visit(this, ctx);
    }

    // Required visitor methods for ng.AstVisitor
    visitBinary(ast: ng.Binary, ctx: FeatureFlagAstVisitorContext): FeatureFlagAstVisitorResult {
        ast.left.visit(this, ctx);
        ast.right.visit(this, ctx);
    }

    visitChain(ast: ng.Chain, ctx: FeatureFlagAstVisitorContext): FeatureFlagAstVisitorResult {
        for (const expr of ast.expressions) {
            expr.visit(this, ctx);
        }
    }

    visitConditional(
        ast: ng.Conditional,
        ctx: FeatureFlagAstVisitorContext
    ): FeatureFlagAstVisitorResult {
        ast.condition.visit(this, ctx);
        ast.trueExp.visit(this, ctx);
        ast.falseExp.visit(this, ctx);
    }

    visitThisReceiver?(
        ast: ng.ThisReceiver,
        ctx: FeatureFlagAstVisitorContext
    ): FeatureFlagAstVisitorResult {
        return;
    }

    visitImplicitReceiver(
        ast: ng.ImplicitReceiver,
        ctx: FeatureFlagAstVisitorContext
    ): FeatureFlagAstVisitorResult {
        return;
    }

    visitInterpolation(
        ast: ng.Interpolation,
        ctx: FeatureFlagAstVisitorContext
    ): FeatureFlagAstVisitorResult {
        for (const expr of ast.expressions) {
            expr.visit(this, ctx);
        }
    }

    visitKeyedRead(
        ast: ng.KeyedRead,
        ctx: FeatureFlagAstVisitorContext
    ): FeatureFlagAstVisitorResult {
        ast.receiver.visit(this, ctx);

        if (ast.key instanceof ng.LiteralPrimitive && typeof ast.key.value === 'string') {
            this.addFlagRead(ast, ast.key.value);
        } else {
            ast.key.visit(this, ctx);
        }
    }

    visitKeyedWrite(
        ast: ng.KeyedWrite,
        ctx: FeatureFlagAstVisitorContext
    ): FeatureFlagAstVisitorResult {
        ast.receiver.visit(this, ctx);
        ast.key.visit(this, ctx);
        ast.value.visit(this, ctx);
    }

    visitLiteralArray(
        ast: ng.LiteralArray,
        ctx: FeatureFlagAstVisitorContext
    ): FeatureFlagAstVisitorResult {
        for (const expr of ast.expressions) {
            expr.visit(this, ctx);
        }
    }

    visitLiteralMap(
        ast: ng.LiteralMap,
        ctx: FeatureFlagAstVisitorContext
    ): FeatureFlagAstVisitorResult {
        for (const value of ast.values) {
            value.visit(this, ctx);
        }
    }

    visitLiteralPrimitive(
        ast: ng.LiteralPrimitive,
        ctx: FeatureFlagAstVisitorContext
    ): FeatureFlagAstVisitorResult {
        return;
    }

    visitPipe(ast: ng.BindingPipe, ctx: FeatureFlagAstVisitorContext): FeatureFlagAstVisitorResult {
        ast.exp.visit(this, ctx);
        for (const arg of ast.args) {
            arg.visit(this, ctx);
        }
    }

    visitPrefixNot(
        ast: ng.PrefixNot,
        ctrx: FeatureFlagAstVisitorContext
    ): FeatureFlagAstVisitorResult {
        ast.expression.visit(this, ctrx);
    }

    visitTypeofExpression(
        ast: ng.TypeofExpression,
        ctx: FeatureFlagAstVisitorContext
    ): FeatureFlagAstVisitorResult {
        ast.expression.visit(this, ctx);
    }

    visitNonNullAssert(
        ast: ng.NonNullAssert,
        ctx: FeatureFlagAstVisitorContext
    ): FeatureFlagAstVisitorResult {
        ast.expression.visit(this, ctx);
    }

    visitPropertyRead(
        ast: ng.PropertyRead,
        ctx: FeatureFlagAstVisitorContext
    ): FeatureFlagAstVisitorResult {
        ast.receiver.visit(this, ctx);
    }

    visitPropertyWrite(
        ast: ng.PropertyWrite,
        ctx: FeatureFlagAstVisitorContext
    ): FeatureFlagAstVisitorResult {
        ast.receiver.visit(this, ctx);
        ast.value.visit(this, ctx);
    }

    visitSafePropertyRead(
        ast: ng.SafePropertyRead,
        ctx: FeatureFlagAstVisitorContext
    ): FeatureFlagAstVisitorResult {
        ast.receiver.visit(this, ctx);
    }

    visitSafeKeyedRead(
        ast: ng.SafeKeyedRead,
        ctx: FeatureFlagAstVisitorContext
    ): FeatureFlagAstVisitorResult {
        ast.receiver.visit(this, ctx);

        if (ast.key instanceof ng.LiteralPrimitive && typeof ast.key.value === 'string') {
            this.addFlagRead(ast, ast.key.value);
        } else {
            ast.key.visit(this, ctx);
        }
    }

    visitCall(ast: ng.Call, ctx: FeatureFlagAstVisitorContext): FeatureFlagAstVisitorResult {
        ast.receiver.visit(this, ctx);
        for (const arg of ast.args) {
            arg.visit(this, ctx);
        }
    }

    visitSafeCall(
        ast: ng.SafeCall,
        ctx: FeatureFlagAstVisitorContext
    ): FeatureFlagAstVisitorResult {
        ast.receiver.visit(this, ctx);
        for (const arg of ast.args) {
            arg.visit(this, ctx);
        }
    }

    visitTemplateLiteral(
        ast: ng.TemplateLiteral,
        ctx: FeatureFlagAstVisitorContext
    ): FeatureFlagAstVisitorResult {
        for (const expr of ast.expressions) {
            expr.visit(this, ctx);
        }
    }

    visitTemplateLiteralElement(
        ast: ng.TemplateLiteralElement,
        ctx: FeatureFlagAstVisitorContext
    ): FeatureFlagAstVisitorResult {
        return;
    }

    visitASTWithSource?(
        ast: ng.ASTWithSource,
        ctx: FeatureFlagAstVisitorContext
    ): FeatureFlagAstVisitorResult {
        ast.ast.visit(this, ctx);
    }

    visit(ast: ng.AST, ctx?: FeatureFlagAstVisitorContext): FeatureFlagAstVisitorResult {
        return;
    }
}
