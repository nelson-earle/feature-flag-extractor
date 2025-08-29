import ts from 'typescript';
import path from 'node:path';
import fs from 'node:fs';

// Command line arguments
const targetProjectPath = process.argv[2];
const tsconfigPath = process.argv[3];

// Check if required arguments are provided
if (!targetProjectPath) {
    console.error('Please provide a path to the target project as the first argument');
    process.exit(1);
}

if (!tsconfigPath) {
    console.error('Please provide a path to the tsconfig.json file as the second argument');
    process.exit(1);
}

// Resolve paths
const absolutePath = path.resolve(targetProjectPath);
const absoluteTsconfigPath = path.resolve(tsconfigPath);

// Check if paths exist
if (!fs.existsSync(absolutePath)) {
    console.error(`Project path does not exist: ${absolutePath}`);
    process.exit(1);
}

if (!fs.existsSync(absoluteTsconfigPath)) {
    console.error(`TSConfig path does not exist: ${absoluteTsconfigPath}`);
    process.exit(1);
}

// Parse tsconfig.json
function loadTsConfig(configPath: string): ts.ParsedCommandLine {
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);

    if (configFile.error) {
        console.error(`Error reading tsconfig: ${configFile.error.messageText}`);
        process.exit(1);
    }

    // Parse the config, handling 'extends' recursively
    const parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(configPath)
    );

    if (parsedConfig.errors.length > 0) {
        console.error('Error parsing tsconfig:');
        for (const error of parsedConfig.errors) {
            console.error(` - ${error.messageText}`);
        }
        process.exit(1);
    }

    return parsedConfig;
}

// Load the config
const tsConfig = loadTsConfig(absoluteTsconfigPath);

// Create the TypeScript program using the tsconfig
const program = ts.createProgram({ rootNames: tsConfig.fileNames, options: tsConfig.options });

const typeChecker = program.getTypeChecker();

for (const sourceFile of program.getSourceFiles()) {
    if (
        !sourceFile.fileName.startsWith(absolutePath) ||
        sourceFile.fileName.includes('node_modules') ||
        sourceFile.fileName.endsWith('.d.ts') ||
        sourceFile.fileName.endsWith('.spec.ts') ||
        sourceFile.fileName.endsWith('.test.ts')
    ) {
        continue;
    }

    /**
     * Extract the flag ID from the value of an identifier or property.
     * @param expression The identifier (e.g. `flagName`) or property (e.g. `this.flagName`).
     * @returns The flag ID or null if the node doesn't match our criteria.
     */
    function extractDynamicFlag(expression: ts.Identifier | ts.PropertyAccessExpression): string | null {
        const symbol = typeChecker.getSymbolAtLocation(expression);

        if (symbol && symbol.declarations.length > 0) {
            const declaration = symbol.declarations[0];
            // Check if it's a variable declaration with initializer
            if ((ts.isVariableDeclaration(declaration) || ts.isPropertyDeclaration(declaration)) && declaration.initializer) {
                if (ts.isStringLiteral(declaration.initializer)) {
                    return declaration.initializer.getText();
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
    function extractFlagFromElementAccess(node: ts.ElementAccessExpression): string | null {
        // Check receiver (object being accessed)
        const receiverIsValid = (
            ts.isPropertyAccessExpression(node.expression) ||
            ts.isIdentifier(node.expression) ||
            ts.isCallExpression(node.expression)
        );
        if (!receiverIsValid) return null;

        // Check key (property being accessed)
        const keyIsValid = (
            ts.isStringLiteral(node.argumentExpression) ||
            ts.isPropertyAccessExpression(node.argumentExpression) ||
            ts.isIdentifier(node.argumentExpression)
        );
        if (!keyIsValid) return null;

        // Get the type of the receiver
        const expressionType = typeChecker.getTypeAtLocation(node.expression);
        const expressionTypeString = typeChecker.typeToString(expressionType);

        // Check if the receiver is an LDFlagSet
        const receiverIsLDFlagSet =
            expressionTypeString.includes('LDFlagSet') ||
            (expressionType.symbol && expressionType.symbol.name === 'LDFlagSet');

        if (!receiverIsLDFlagSet) return null;

        // Extract the flag ID
        let flag: string | null = null;

        if (ts.isStringLiteral(node.argumentExpression)) {
            // Direct string literal like `flags['feature']`
            flag = node.argumentExpression.getText();
        } else {
            // Handle property reads like `flags[FEATURE_FLAG]`
            const keyType = typeChecker.getTypeAtLocation(node.argumentExpression);
            const keyTypeString = typeChecker.typeToString(keyType);

            if (keyTypeString.startsWith('"')) {
                // Key is a string literal
                flag = keyTypeString;
            } else if (ts.isIdentifier(node.argumentExpression) || ts.isPropertyAccessExpression(node.argumentExpression)) {
                // Try to find the literal value from symbol declaration
                flag = extractDynamicFlag(node.argumentExpression);
            } else if (keyTypeString !== 'string') {
                // Neither a string literal or an identifier/property read
                console.warn(`Found read of 'LDFlagSet' with key of unsupported type: ${keyTypeString}`);
            }
        }

        if (!flag) {
            console.warn(`Unable to get flag ID for 'LDFlagSet' read: ${node.getText()}`);
        }

        return flag;
    }

    function visit(node: ts.Node) {
        if (ts.isElementAccessExpression(node)) {
            const flag = extractFlagFromElementAccess(node);

            if (flag) {
                const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
                const relativePath = path.relative(absolutePath, sourceFile.fileName);
                console.log(`${relativePath}:${line + 1}:${character + 1} | ${flag}`);
            }
        }

        ts.forEachChild(node, visit);
    }

    ts.forEachChild(sourceFile, visit);
}
