import * as ts from 'typescript';
import * as ng from '@angular/compiler';
import { BuilderContext, BuilderOutput, createBuilder } from '@angular-devkit/architect';
import { JsonObject } from '@angular-devkit/core';

interface Options extends JsonObject {
    verbose: boolean | null;
}

export default createBuilder(
    async (_options: Options, context: BuilderContext): Promise<BuilderOutput> => {
        context.logger.info('TODO: extract template flags');

        // const host = ts.createCompilerHost({});
        const program = ts.createProgram({ rootNames: [], options: {} });

        return Promise.resolve({ success: true });
    }
);

/*
const ParseMode = Object.freeze({
    NONE: '<none>',
    RECEIVER: 'receiver',
    KEY: 'key',
});

type ParseMode = (typeof ParseMode)[keyof typeof ParseMode];

const KeyedReadKind = Object.freeze({
    NONE: '<none>',
    PROP: 'property',
    CALL: 'call',
});

type KeyedReadKind = (typeof KeyedReadKind)[keyof typeof KeyedReadKind];

interface KeyedRead {
    kind: KeyedReadKind;
    receiver: {
        ast: ng.AST;
        prop?: { name: string };
        call?: { receiver: ng.AST };
    };
    key: {
        ast: ng.AST;
        literal?: { value: string };
        prop?: { name: string };
    };
}

class FeatureFlagAstVisitorContext {
    parseMode: ParseMode;
    keyedReads: KeyedRead[];
    potentialFeatureFlagKeyedReads: KeyedRead[];

    constructor(
        parseMode?: typeof this.parseMode,
        keyedReads?: typeof this.keyedReads,
        potentialFeatureFlags?: typeof this.potentialFeatureFlagKeyedReads
    ) {
        this.parseMode = parseMode ?? ParseMode.NONE;
        this.keyedReads = keyedReads ?? [];
        this.potentialFeatureFlagKeyedReads = potentialFeatureFlags ?? [];
    }

    static #from(
        current: FeatureFlagAstVisitorContext,
        parseMode: ParseMode
    ): FeatureFlagAstVisitorContext {
        return new FeatureFlagAstVisitorContext(
            parseMode,
            current.keyedReads,
            current.potentialFeatureFlagKeyedReads
        );
    }

    next(): FeatureFlagAstVisitorContext {
        const next = FeatureFlagAstVisitorContext.#from(this, ParseMode.NONE);
        return next;
    }

    nextForReceiver(): FeatureFlagAstVisitorContext {
        const next = FeatureFlagAstVisitorContext.#from(this, ParseMode.RECEIVER);
        return next;
    }

    nextForKey(): FeatureFlagAstVisitorContext {
        const next = FeatureFlagAstVisitorContext.#from(this, ParseMode.KEY);
        return next;
    }
}

class FeatureFlagAstVisitor implements ng.AstVisitor {
    visitUnary(ast: ng.Unary, context: FeatureFlagAstVisitorContext) {
        throw new Error('Method not implemented: ast unary');
    }

    visitBinary(ast: ng.Binary, context: FeatureFlagAstVisitorContext) {
        throw new Error('Method not implemented: ast binary');
    }

    visitChain(ast: ng.Chain, context: FeatureFlagAstVisitorContext) {
        throw new Error('Method not implemented: ast chain');
    }

    visitConditional(ast: ng.Conditional, context: FeatureFlagAstVisitorContext) {
        throw new Error('Method not implemented: ast conditional');
    }

    visitThisReceiver(ast: ng.ThisReceiver, context: FeatureFlagAstVisitorContext) {
        throw new Error('Method not implemented: ast this receiver');
    }

    visitImplicitReceiver(ast: ng.ImplicitReceiver, context: FeatureFlagAstVisitorContext) {
        throw new Error('Method not implemented: ast implicit receiver');
    }

    visitInterpolation(ast: ng.Interpolation, context: FeatureFlagAstVisitorContext) {
        for (const expr of ast.expressions) {
            expr.visit(this, context.next());
        }
    }

    visitKeyedRead(ast: ng.KeyedRead, context: FeatureFlagAstVisitorContext) {
        context.keyedReads.push({
            kind: KeyedReadKind.NONE,
            receiver: { ast: ast.receiver },
            key: { ast: ast.key },
        });

        ast.receiver.visit(this, context.nextForReceiver());
        ast.key.visit(this, context.nextForKey());

        let keyedRead = context.keyedReads.pop();
        if (keyedRead && keyedRead.kind != KeyedReadKind.NONE) {
            context.potentialFeatureFlagKeyedReads.push(keyedRead);
        }
    }

    visitKeyedWrite(ast: ng.KeyedWrite, context: FeatureFlagAstVisitorContext) {
        throw new Error('Method not implemented: ast keyed write');
    }

    visitLiteralArray(ast: ng.LiteralArray, context: FeatureFlagAstVisitorContext) {
        throw new Error('Method not implemented: ast literal array');
    }

    visitLiteralMap(ast: ng.LiteralMap, context: FeatureFlagAstVisitorContext) {
        throw new Error('Method not implemented: ast literal map');
    }

    visitLiteralPrimitive(ast: ng.LiteralPrimitive, context: FeatureFlagAstVisitorContext) {
        if (context.parseMode === ParseMode.KEY) {
            const keyedRead = context.keyedReads.at(-1);
            if (keyedRead) {
                keyedRead.key.literal = { value: ast.value };
            }
        }
    }

    visitPipe(ast: ng.BindingPipe, context: FeatureFlagAstVisitorContext) {
        throw new Error('Method not implemented: ast pipe');
    }

    visitPrefixNot(ast: ng.PrefixNot, context: FeatureFlagAstVisitorContext) {
        throw new Error('Method not implemented: ast prefix not');
    }

    visitTypeofExpression(ast: ng.TypeofExpression, context: FeatureFlagAstVisitorContext) {
        throw new Error('Method not implemented: ast typeof expression');
    }

    visitNonNullAssert(ast: ng.NonNullAssert, context: FeatureFlagAstVisitorContext) {
        throw new Error('Method not implemented: ast non null assert');
    }

    visitPropertyRead(ast: ng.PropertyRead, context: FeatureFlagAstVisitorContext) {
        if (context.parseMode === ParseMode.RECEIVER) {
            const keyedRead = context.keyedReads.at(-1);
            if (keyedRead) {
                keyedRead.kind = KeyedReadKind.PROP;
                keyedRead.receiver.prop = { name: ast.name };
            }
        } else if (context.parseMode === ParseMode.KEY) {
            const keyedRead = context.keyedReads.at(-1);
            if (keyedRead) {
                keyedRead.key.prop = { name: ast.name };
            }
        }
    }

    visitPropertyWrite(ast: ng.PropertyWrite, context: FeatureFlagAstVisitorContext) {
        throw new Error('Method not implemented: ast property write');
    }

    visitSafePropertyRead(ast: ng.SafePropertyRead, context: FeatureFlagAstVisitorContext) {
        throw new Error('Method not implemented: ast safe property read');
    }

    visitSafeKeyedRead(ast: ng.SafeKeyedRead, context: FeatureFlagAstVisitorContext) {
        throw new Error('Method not implemented: ast safe keyed read');
    }

    visitCall(ast: ng.Call, context: FeatureFlagAstVisitorContext) {
        for (const arg of ast.args) {
            arg.visit(this, context.next());
        }

        if (context.parseMode === ParseMode.RECEIVER) {
            const keyedRead = context.keyedReads.at(-1);
            if (keyedRead) {
                keyedRead.kind = KeyedReadKind.CALL;
                keyedRead.receiver.call = { receiver: ast.receiver };
            }
        }
    }

    visitSafeCall(ast: ng.SafeCall, context: FeatureFlagAstVisitorContext) {
        throw new Error('Method not implemented: ast safe call');
    }

    visitTemplateLiteral(ast: ng.TemplateLiteral, context: FeatureFlagAstVisitorContext) {
        throw new Error('Method not implemented: ast template literal');
    }

    visitTemplateLiteralElement(
        ast: ng.TemplateLiteralElement,
        context: FeatureFlagAstVisitorContext
    ) {
        throw new Error('Method not implemented: ast template literal element');
    }

    visitASTWithSource(ast: ng.ASTWithSource, context: FeatureFlagAstVisitorContext) {
        ast.ast.visit(this, context.next());
    }

    visit?(ast: ng.AST, context?: any) {
        throw new Error('Method not implemented: ast <root>');
    }
}

type FeatureFlagVisitorResult = void;

class FeatureFlagVisitor implements ng.TmplAstVisitor<FeatureFlagVisitorResult> {
    #astVisitor = new FeatureFlagAstVisitor();
    #astVisitorContext = new FeatureFlagAstVisitorContext();

    get potentialFeatureFlagKeyedReads(): KeyedRead[] {
        return this.#astVisitorContext.potentialFeatureFlagKeyedReads;
    }

    visit?(node: ng.TmplAstNode): FeatureFlagVisitorResult {
        throw new Error('Method not implemented: node');
    }

    visitElement(element: ng.TmplAstElement): FeatureFlagVisitorResult {
        for (const attr of element.attributes) {
            attr.visit(this);
        }

        for (const input of element.inputs) {
            input.visit(this);
        }

        for (const output of element.outputs) {
            output.visit(this);
        }

        for (const child of element.children) {
            child.visit(this);
        }
    }

    visitTemplate(template: ng.TmplAstTemplate): FeatureFlagVisitorResult {
        throw new Error('Method not implemented: template');
    }

    visitContent(content: ng.TmplAstContent): FeatureFlagVisitorResult {
        throw new Error('Method not implemented: content');
    }

    visitVariable(variable: ng.TmplAstVariable): FeatureFlagVisitorResult {
        throw new Error('Method not implemented: variable');
    }

    visitReference(reference: ng.TmplAstReference): FeatureFlagVisitorResult {
        throw new Error('Method not implemented: reference');
    }

    visitTextAttribute(attribute: ng.TmplAstTextAttribute): FeatureFlagVisitorResult {
        throw new Error('Method not implemented: attribute');
    }

    visitBoundAttribute(attribute: ng.TmplAstBoundAttribute): FeatureFlagVisitorResult {
        attribute.value.visit(this.#astVisitor, this.#astVisitorContext);
    }

    visitBoundEvent(attribute: ng.TmplAstBoundEvent): FeatureFlagVisitorResult {
        attribute.handler.visit(this.#astVisitor, this.#astVisitorContext);
    }

    visitText(_text: ng.TmplAstText): FeatureFlagVisitorResult { }

    visitBoundText(text: ng.TmplAstBoundText): FeatureFlagVisitorResult {
        text.value.visit(this.#astVisitor, this.#astVisitorContext);
    }

    visitIcu(icu: ng.TmplAstIcu): FeatureFlagVisitorResult {
        throw new Error('Method not implemented: icu');
    }

    visitDeferredBlock(deferred: ng.TmplAstDeferredBlock): FeatureFlagVisitorResult {
        throw new Error('Method not implemented: deferred block');
    }

    visitDeferredBlockPlaceholder(
        block: ng.TmplAstDeferredBlockPlaceholder
    ): FeatureFlagVisitorResult {
        throw new Error('Method not implemented: deferred block placeholder');
    }

    visitDeferredBlockError(block: ng.TmplAstDeferredBlockError): FeatureFlagVisitorResult {
        throw new Error('Method not implemented: deferred block error');
    }

    visitDeferredBlockLoading(block: ng.TmplAstDeferredBlockLoading): FeatureFlagVisitorResult {
        throw new Error('Method not implemented: deferred block loading');
    }

    visitDeferredTrigger(trigger: ng.TmplAstDeferredTrigger): FeatureFlagVisitorResult {
        throw new Error('Method not implemented: deferred trigger');
    }

    visitSwitchBlock(block: ng.TmplAstSwitchBlock): FeatureFlagVisitorResult {
        throw new Error('Method not implemented: switch block');
    }

    visitSwitchBlockCase(block: ng.TmplAstSwitchBlockCase): FeatureFlagVisitorResult {
        throw new Error('Method not implemented: switch block case');
    }

    visitForLoopBlock(block: ng.TmplAstForLoopBlock): FeatureFlagVisitorResult {
        throw new Error('Method not implemented: for loop block');
    }

    visitForLoopBlockEmpty(block: ng.TmplAstForLoopBlockEmpty): FeatureFlagVisitorResult {
        throw new Error('Method not implemented: for loop block empty');
    }

    visitIfBlock(block: ng.TmplAstIfBlock): FeatureFlagVisitorResult {
        throw new Error('Method not implemented: if block');
    }

    visitIfBlockBranch(block: ng.TmplAstIfBlockBranch): FeatureFlagVisitorResult {
        throw new Error('Method not implemented: if block branch');
    }

    visitUnknownBlock(block: ng.TmplAstUnknownBlock): FeatureFlagVisitorResult {
        throw new Error('Method not implemented: unknown block');
    }

    visitLetDeclaration(decl: ng.TmplAstLetDeclaration): FeatureFlagVisitorResult {
        throw new Error('Method not implemented: let declaration');
    }
}

function extractTemplateFeatureFlags(template: ng.ParsedTemplate) {
    const featureFlagVisitor = new FeatureFlagVisitor();

    for (const node of template.nodes) {
        node.visit(featureFlagVisitor);
    }

    return featureFlagVisitor.potentialFeatureFlagKeyedReads;
}
*/

// const template = `
//         <p>[{{ obj.flags['abc'] }}]</p>
//         <div [ngStyle]="classes()['def']">
//             <button (click)="onClick($event)">Click</button>
//         </div>
//     `;
//
// const templateUrl = 'file:///Users/nelson/Projects/Scratch/angular-home-tutorial/src/app/app.html';
//
// const ast = ng.parseTemplate(template, templateUrl, {
//     // collectCommentNodes: true,
//     enableBlockSyntax: true,
//     enableLetSyntax: true,
//     // preserveLineEndings: true,
//     // preserveWhitespaces: true,
// });
//
// const featureFlags = extractTemplateFeatureFlags(ast);
// for (const kr of featureFlags) {
//     console.log(`::: READ FROM ${String(kr.kind)}`);
//
//     if (kr.receiver.prop) {
//         console.log(`    RECV: ${kr.receiver.prop.name}`);
//     } else if (kr.receiver.call) {
//         console.log(`    RECV: ${kr.receiver.call.receiver} (TODO)`);
//     }
//
//     if (kr.key.literal) {
//         console.log(`    KEY:  ${kr.key.literal.value}`);
//     } else if (kr.key.prop) {
//         console.log(`    KEY:  ${kr.key.prop.name}`);
//     }
// }
