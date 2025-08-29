import ts from 'typescript';
import path from 'node:path';
import fs from 'node:fs';

const targetProjectPath = process.argv[2];

if (!targetProjectPath) {
    console.error('Please provide a path to the target project as the first argument');
    process.exit(1);
}

const absolutePath = path.resolve(targetProjectPath);

if (!fs.existsSync(absolutePath)) {
    console.error(`Path does not exist: ${absolutePath}`);
    process.exit(1);
}

function findTypeScriptFiles(dir: string): string[] {
    const files: string[] = [];

    function traverseDirectory(currentDir: string) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);

            if (entry.isDirectory() && entry.name !== 'node_modules') {
                traverseDirectory(fullPath);
            } else if (
                entry.isFile() &&
                entry.name.endsWith('.ts') &&
                !entry.name.endsWith('.d.ts') &&
                !entry.name.endsWith('.spec.ts') &&
                !entry.name.endsWith('.test.ts')
            ) {
                files.push(fullPath);
            }
        }
    }

    traverseDirectory(dir);
    return files;
}

const tsFiles = findTypeScriptFiles(absolutePath);
const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2015,
    module: ts.ModuleKind.CommonJS
};

const program = ts.createProgram(tsFiles, compilerOptions);
const typeChecker = program.getTypeChecker();

for (const sourceFile of program.getSourceFiles()) {
    if (
        sourceFile.fileName.includes('node_modules') ||
        sourceFile.fileName.endsWith('.d.ts') ||
        sourceFile.fileName.endsWith('.spec.ts') ||
        sourceFile.fileName.endsWith('.test.ts')
    ) {
        continue;
    }

    if (!sourceFile.fileName.startsWith(absolutePath)) {
        continue;
    }

    function visit(node: ts.Node) {
        if (ts.isElementAccessExpression(node)) {
            const receiverIsValid = (
                ts.isPropertyAccessExpression(node.expression) ||
                ts.isIdentifier(node.expression) ||
                ts.isCallExpression(node.expression)
            );

            const keyIsValid = (
                ts.isStringLiteral(node.argumentExpression) ||
                ts.isPropertyAccessExpression(node.argumentExpression) ||
                ts.isIdentifier(node.argumentExpression)
            );

            if (receiverIsValid && keyIsValid) {
                const expressionType = typeChecker.getTypeAtLocation(node.expression);
                const expressionTypeString = typeChecker.typeToString(expressionType);

                const receiverIsLDFlagSet =
                    expressionTypeString.includes('LDFlagSet') ||
                    (expressionType.symbol && expressionType.symbol.name === 'LDFlagSet');

                if (receiverIsLDFlagSet) {
                    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());

                    // Print the location information (file:line:col)
                    const relativePath = path.relative(absolutePath, sourceFile.fileName);
                    console.log(`${relativePath}:${line + 1}:${character + 1} | ${node.argumentExpression.getText()}`);
                }
            }
        }

        ts.forEachChild(node, visit);
    }

    ts.forEachChild(sourceFile, visit);
}
