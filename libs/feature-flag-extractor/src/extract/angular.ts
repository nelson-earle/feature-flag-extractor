import { BuilderContext } from '@angular-devkit/architect';
import { FlagRead } from '.';
import * as ng from '@angular/compiler';

export function extractFeatureFlagsFromTemplate(
    ctx: BuilderContext,
    templateUrl: string,
    template: string
): FlagRead[] {
    // Parse the template using the Angular compiler
    const parsedTemplate = parseTemplate(ctx, template, templateUrl);
    if (!parsedTemplate) return [];

    // Create visitors to extract feature flags
    const visitor = new TemplateFeatureFlagVisitor(templateUrl);

    // Visit each node in the template
    parsedTemplate.nodes.forEach(node => node.visit<void>(visitor));

    // Return the extracted flags
    return visitor.getFlagReads();
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

type TemplateFeatureFlagVisitorResult = void;

interface VisitorPosition {
    line: number;
    col: number;
}

/**
 * Visitor class that extracts feature flag accesses from Angular templates
 *
 */
class TemplateFeatureFlagVisitor implements ng.TmplAstVisitor<TemplateFeatureFlagVisitorResult> {
    private flagReads: FlagRead[] = [];
    private readonly urlPath: string;
    private readonly bindingVisitor: BindingFeatureFlagVisitor;

    constructor(templateUrl: string) {
        // Convert file:// URL to a relative path for consistent reporting
        this.urlPath = templateUrl.replace('file://', '');
        this.bindingVisitor = new BindingFeatureFlagVisitor(this.urlPath, this.flagReads);
    }

    getFlagReads(): FlagRead[] {
        return this.flagReads;
    }

    // visit?(node: Node): Result;

    // Required visitor methods for ng.TmplAstVisitor
    visitElement(element: ng.TmplAstElement): TemplateFeatureFlagVisitorResult {
        // Visit all inputs (property bindings)
        element.inputs.forEach(input => {
            // The value of the input binding could contain a feature flag
            const value = input.value;
            if (value instanceof ng.ASTWithSource) {
                value.ast.visit(this.bindingVisitor, {
                    line: value.sourceSpan.start.line,
                    col: value.sourceSpan.start.col,
                });
            }
        });

        // Visit all outputs (event bindings)
        element.outputs.forEach(output => {
            const handler = output.handler;
            if (handler instanceof ng.ASTWithSource) {
                handler.ast.visit(this.bindingVisitor, {
                    line: handler.sourceSpan.start.line,
                    col: handler.sourceSpan.start.col,
                });
            }
        });

        // Visit attributes (static and dynamic)
        element.attributes.forEach(attr => {
            // Static attributes usually don't contain feature flags, but included for completeness
        });

        // Visit references (e.g., #ref)
        element.references.forEach(ref => {
            // References usually don't contain feature flags
        });

        // Recursively visit children
        element.children.forEach(child => child.visit<TemplateFeatureFlagVisitorResult>(this));
    }

    visitTemplate(template: ng.TmplAstTemplate): TemplateFeatureFlagVisitorResult {
        // Visit template attributes
        template.templateAttrs.forEach(attr => {
            // Template attributes might contain feature flags in their bindings
        });

        // Visit all inputs (property bindings)
        template.inputs.forEach(input => {
            const value = input.value;
            if (value instanceof ng.ASTWithSource) {
                value.ast.visit(this.bindingVisitor, {
                    line: value.sourceSpan.start.line,
                    col: value.sourceSpan.start.col,
                });
            }
        });

        // Visit all outputs (event bindings)
        template.outputs.forEach(output => {
            const handler = output.handler;
            if (handler instanceof ng.ASTWithSource) {
                handler.ast.visit(this.bindingVisitor, {
                    line: handler.sourceSpan.start.line,
                    col: handler.sourceSpan.start.col,
                });
            }
        });

        // Recursively visit children
        template.children.forEach(child => child.visit(this));
    }

    visitContent(content: ng.TmplAstContent): TemplateFeatureFlagVisitorResult {
        // Content projection, usually doesn't contain feature flags directly
    }

    visitVariable(variable: ng.TmplAstVariable): TemplateFeatureFlagVisitorResult {
        // Template variables, usually don't contain feature flags
    }

    visitReference(reference: ng.TmplAstReference): TemplateFeatureFlagVisitorResult {
        // References usually don't contain feature flags
    }

    visitTextAttribute(attribute: ng.TmplAstTextAttribute): TemplateFeatureFlagVisitorResult {
        // Static text attributes usually don't contain feature flags
    }

    visitBoundAttribute(attribute: ng.TmplAstBoundAttribute): TemplateFeatureFlagVisitorResult {
        const value = attribute.value;
        if (value instanceof ng.ASTWithSource) {
            value.ast.visit(this.bindingVisitor, {
                line: value.sourceSpan.start.line,
                col: value.sourceSpan.start.col,
            });
        }
    }

    visitBoundEvent(event: ng.TmplAstBoundEvent): TemplateFeatureFlagVisitorResult {
        const handler = event.handler;
        if (handler instanceof ng.ASTWithSource) {
            handler.ast.visit(this.bindingVisitor, {
                line: handler.sourceSpan.start.line,
                col: handler.sourceSpan.start.col,
            });
        }
    }

    visitText(text: ng.TmplAstText): TemplateFeatureFlagVisitorResult {
        // Static text doesn't contain feature flags
    }

    visitBoundText(text: ng.TmplAstBoundText): TemplateFeatureFlagVisitorResult {
        const value = text.value;
        if (value instanceof ng.ASTWithSource) {
            value.ast.visit(this.bindingVisitor, {
                line: value.sourceSpan.start.line,
                col: value.sourceSpan.start.col,
            });
        }
    }

    visitIcu(icu: ng.TmplAstIcu): TemplateFeatureFlagVisitorResult {
        // ICU expressions might contain feature flags
        // Parse ICU cases if needed
    }

    visitDeferredBlock(deferred: ng.TmplAstDeferredBlock): TemplateFeatureFlagVisitorResult {
        deferred.children.forEach(child => child.visit(this));
        if (deferred.placeholder) {
            deferred.placeholder.children.forEach(child => child.visit(this));
        }
        if (deferred.loading) {
            deferred.loading.children.forEach(child => child.visit(this));
        }
        if (deferred.error) {
            deferred.error.children.forEach(child => child.visit(this));
        }
    }

    visitDeferredBlockPlaceholder(
        block: ng.TmplAstDeferredBlockPlaceholder
    ): TemplateFeatureFlagVisitorResult {
        block.children.forEach(child => child.visit(this));
    }

    visitDeferredBlockError(block: ng.TmplAstDeferredBlockError): TemplateFeatureFlagVisitorResult {
        block.children.forEach(child => child.visit(this));
    }

    visitDeferredBlockLoading(
        block: ng.TmplAstDeferredBlockLoading
    ): TemplateFeatureFlagVisitorResult {
        block.children.forEach(child => child.visit(this));
    }

    visitDeferredTrigger(_trigger: ng.TmplAstDeferredTrigger): TemplateFeatureFlagVisitorResult {
        return;
    }

    visitSwitchBlock(switchBlock: ng.TmplAstSwitchBlock): TemplateFeatureFlagVisitorResult {
        // Angular 17+ switch block
        if (switchBlock.expression instanceof ng.ASTWithSource) {
            switchBlock.expression.ast.visit(this.bindingVisitor, {
                line: switchBlock.expression.sourceSpan.start.line,
                col: switchBlock.expression.sourceSpan.start.col,
            });
        }
        switchBlock.cases.forEach(case_ => {
            if (case_.expression instanceof ng.ASTWithSource) {
                case_.expression.ast.visit(this.bindingVisitor, {
                    line: case_.expression.sourceSpan.start.line,
                    col: case_.expression.sourceSpan.start.col,
                });
            }
            case_.children.forEach(child => child.visit(this));
        });
    }

    visitSwitchBlockCase(switchCase: ng.TmplAstSwitchBlockCase): TemplateFeatureFlagVisitorResult {
        switchCase.children.forEach(child => child.visit(this));
    }

    visitForLoopBlock(block: ng.TmplAstForLoopBlock): TemplateFeatureFlagVisitorResult {
        // Angular 17+ for block
        if (block.expression instanceof ng.ASTWithSource) {
            block.expression.ast.visit(this.bindingVisitor, {
                line: block.expression.sourceSpan.start.line,
                col: block.expression.sourceSpan.start.col,
            });
        }
        block.children.forEach(child => child.visit(this));
        if (block.empty) {
            block.empty.children.forEach(child => child.visit(this));
        }
    }

    visitForLoopBlockEmpty(block: ng.TmplAstForLoopBlockEmpty): TemplateFeatureFlagVisitorResult {
        block.children.forEach(child => child.visit(this));
    }

    visitIfBlock(ifBlock: ng.TmplAstIfBlock): TemplateFeatureFlagVisitorResult {
        // Angular 17+ if block
        ifBlock.branches.forEach(branch => {
            if (branch.expression instanceof ng.ASTWithSource) {
                branch.expression.ast.visit(this.bindingVisitor, {
                    line: branch.expression.sourceSpan.start.line,
                    col: branch.expression.sourceSpan.start.col,
                });
            }
            branch.children.forEach(child => child.visit(this));
        });
    }

    visitIfBlockBranch(branch: ng.TmplAstIfBlockBranch): TemplateFeatureFlagVisitorResult {
        branch.children.forEach(child => child.visit(this));
    }

    visitUnknownBlock(_block: ng.TmplAstUnknownBlock): void {
        return;
    }

    visitLetDeclaration(decl: ng.TmplAstLetDeclaration): TemplateFeatureFlagVisitorResult {
        // Angular 17+ let declaration
        const value = decl.value;
        if (value instanceof ng.ASTWithSource) {
            value.ast.visit(this.bindingVisitor, {
                line: value.sourceSpan.start.line,
                col: value.sourceSpan.start.col,
            });
        }
    }
}

type BindingFeatureFlagVisitorResult = void;

/**
 * Visitor for expressions inside bindings to find feature flag accesses
 */
class BindingFeatureFlagVisitor implements ng.AstVisitor {
    constructor(
        private readonly filePath: string,
        private readonly flagReads: FlagRead[]
    ) {}

    // Helper to add a flag read to the results
    private addFlagRead(flagId: string, position: VisitorPosition) {
        // Remove quotes from flag ID if present
        const cleanFlagId = flagId.replace(/["']/g, '');

        this.flagReads.push({
            filePathRelative: this.filePath,
            row: position.line,
            col: position.col,
            flagId: cleanFlagId,
        });
    }

    visitUnary?(ast: ng.Unary, context: any) {
        throw new Error('Method not implemented.');
    }

    // Required visitor methods for ng.AstVisitor
    visitBinary(ast: ng.Binary, position: VisitorPosition): BindingFeatureFlagVisitorResult {
        ast.left.visit(this, position);
        ast.right.visit(this, position);
    }

    visitChain(ast: ng.Chain, position: VisitorPosition): BindingFeatureFlagVisitorResult {
        ast.expressions.forEach(expr => expr.visit(this, position));
    }

    visitConditional(
        ast: ng.Conditional,
        position: VisitorPosition
    ): BindingFeatureFlagVisitorResult {
        ast.condition.visit(this, position);
        ast.trueExp.visit(this, position);
        ast.falseExp.visit(this, position);
    }

    visitThisReceiver?(
        ast: ng.ThisReceiver,
        position: VisitorPosition
    ): BindingFeatureFlagVisitorResult {
        return;
    }

    visitImplicitReceiver(
        ast: ng.ImplicitReceiver,
        position: VisitorPosition
    ): BindingFeatureFlagVisitorResult {
        return;
    }

    visitInterpolation(
        ast: ng.Interpolation,
        position: VisitorPosition
    ): BindingFeatureFlagVisitorResult {
        ast.expressions.forEach(expr => expr.visit(this, position));
    }

    visitKeyedRead(ast: ng.KeyedRead, position: VisitorPosition): BindingFeatureFlagVisitorResult {
        // This is the main place where we find feature flag access in templates
        // Example: flags()['flag-name']
        // We need to check if this is accessing a property on a LDFlagSet

        // First visit the object being accessed
        ast.receiver.visit(this, position);

        // Now check if the key is a string literal, which would be a flag name
        if (ast.key instanceof ng.LiteralPrimitive && typeof ast.key.value === 'string') {
            // Check if the object is a feature flag set by looking at naming patterns
            // This is a simple heuristic and might need refinement based on your app's patterns
            const objText = ast.receiver.toString().toLowerCase();

            if (
                objText.includes('flag') ||
                objText.includes('featureflag') ||
                objText.includes('feature')
            ) {
                this.addFlagRead(ast.key.value, position);
            }
        }

        ast.key.visit(this, position);
    }

    visitKeyedWrite(
        ast: ng.KeyedWrite,
        position: VisitorPosition
    ): BindingFeatureFlagVisitorResult {
        ast.receiver.visit(this, position);
        ast.key.visit(this, position);
        ast.value.visit(this, position);
    }

    visitLiteralArray(
        ast: ng.LiteralArray,
        position: VisitorPosition
    ): BindingFeatureFlagVisitorResult {
        ast.expressions.forEach(expr => expr.visit(this, position));
    }

    visitLiteralMap(
        ast: ng.LiteralMap,
        position: VisitorPosition
    ): BindingFeatureFlagVisitorResult {
        ast.values.forEach(value => value.visit(this, position));
    }

    visitLiteralPrimitive(
        ast: ng.LiteralPrimitive,
        position: VisitorPosition
    ): BindingFeatureFlagVisitorResult {
        return;
    }

    visitPipe(ast: ng.BindingPipe, position: VisitorPosition): BindingFeatureFlagVisitorResult {
        ast.exp.visit(this, position);
        ast.args.forEach(arg => arg.visit(this, position));
    }

    visitPrefixNot(ast: ng.PrefixNot, position: VisitorPosition): BindingFeatureFlagVisitorResult {
        ast.expression.visit(this, position);
    }

    visitTypeofExpression(ast: ng.TypeofExpression, context: any) {
        throw new Error('Method not implemented.');
    }

    visitNonNullAssert(
        ast: ng.NonNullAssert,
        position: VisitorPosition
    ): BindingFeatureFlagVisitorResult {
        ast.expression.visit(this, position);
    }

    visitPropertyRead(
        ast: ng.PropertyRead,
        position: VisitorPosition
    ): BindingFeatureFlagVisitorResult {
        ast.receiver.visit(this, position);
    }

    visitPropertyWrite(
        ast: ng.PropertyWrite,
        position: VisitorPosition
    ): BindingFeatureFlagVisitorResult {
        ast.receiver.visit(this, position);
        ast.value.visit(this, position);
    }

    visitSafePropertyRead(
        ast: ng.SafePropertyRead,
        position: VisitorPosition
    ): BindingFeatureFlagVisitorResult {
        ast.receiver.visit(this, position);
    }

    visitSafeKeyedRead(
        ast: ng.SafeKeyedRead,
        position: VisitorPosition
    ): BindingFeatureFlagVisitorResult {
        // Similar to KeyedRead but with the safe navigation operator
        // Example: flags()?['flag-name']
        ast.receiver.visit(this, position);

        if (ast.key instanceof ng.LiteralPrimitive && typeof ast.key.value === 'string') {
            const objText = ast.receiver.toString().toLowerCase();

            if (
                objText.includes('flag') ||
                objText.includes('featureflag') ||
                objText.includes('feature')
            ) {
                this.addFlagRead(ast.key.value, position);
            }
        }

        ast.key.visit(this, position);
    }

    visitCall(ast: ng.Call, context: any) {
        throw new Error('Method not implemented.');
    }

    visitSafeCall(ast: ng.SafeCall, context: any) {
        throw new Error('Method not implemented.');
    }

    visitTemplateLiteral(ast: ng.TemplateLiteral, context: any) {
        throw new Error('Method not implemented.');
    }

    visitTemplateLiteralElement(ast: ng.TemplateLiteralElement, context: any) {
        throw new Error('Method not implemented.');
    }

    visitASTWithSource?(ast: ng.ASTWithSource, context: any) {
        throw new Error('Method not implemented.');
    }

    visit?(ast: ng.AST, context?: any) {
        throw new Error('Method not implemented.');
    }
}
