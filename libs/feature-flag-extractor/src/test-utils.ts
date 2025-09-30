import { BuilderContext } from '@angular-devkit/architect';

export function buildBuilderContext(): BuilderContext {
    const ctx = { logger: {} } as BuilderContext;
    for (const method of ['fatal', 'error', 'warn', 'info', 'log', 'debug']) {
        ctx.logger[method] = jest.fn();
    }
    return ctx;
}
