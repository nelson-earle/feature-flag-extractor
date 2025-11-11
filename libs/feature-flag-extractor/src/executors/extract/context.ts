import type { ExecutorContext } from '@nx/devkit';
import { Logger } from './logger';

export interface Context extends ExecutorContext {
    logger: Logger;
}
