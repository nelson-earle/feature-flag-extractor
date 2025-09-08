# Template Logger Builder Usage

This builder scans your Angular project and logs all component templates (both inline and external).

## Setup Instructions

1. Install dependencies:

```bash
npm install --save-dev @angular-devkit/architect typescript @angular/compiler
```

2. Create a `builders.json` file in your project:

```json
{
    "$schema": "./node_modules/@angular-devkit/architect/src/builders-schema.json",
    "builders": {
        "template-logger": {
            "implementation": "./template-logger.builder.ts",
            "schema": "./template-logger-schema.json",
            "description": "Logs all component templates in the project"
        }
    }
}
```

3. Add the builder to your `angular.json`:

```json
{
    "projects": {
        "your-project": {
            "architect": {
                "log-templates": {
                    "builder": "./template-logger:template-logger",
                    "options": {}
                }
            }
        }
    }
}
```

4. Run the builder:

```bash
nx run your-project:log-templates
# or with Angular CLI
ng run your-project:log-templates
```

## How It Works

The builder:

1. Identifies all TypeScript files that might contain components
2. Uses TypeScript's Compiler API to parse files and find `@Component` decorators
3. Extracts both inline templates and references to external template files
4. Processes external template files by reading their content
5. Uses Angular's `parseTemplate` function to parse templates into ASTs
6. Logs template content to the console

## Extending

You can extend this builder to:

-   Analyze template content
-   Extract specific information (e.g., component selectors, inputs, outputs)
-   Generate documentation
-   Create reports about component usage patterns

Modify the `processTemplate` function to implement your specific requirements.
