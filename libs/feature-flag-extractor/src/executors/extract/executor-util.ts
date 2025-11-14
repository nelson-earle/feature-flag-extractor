import type { PromiseExecutor } from '@nx/devkit';

export type ExecutorResult = Awaited<ReturnType<PromiseExecutor>>;

export const EXECUTOR_RESULT_SUCCESS: ExecutorResult = { success: true };
export const EXECUTOR_RESULT_FAILURE: ExecutorResult = { success: false };

export function error(message: string): ExecutorResult {
    console.error(message);
    return EXECUTOR_RESULT_FAILURE;
}
