import type { ExecutorContext } from '@nx/devkit';
import { Logger } from '../logger';
import { Options } from '../schema';

export interface Context extends ExecutorContext {
    projectRoot: string;
    logger: Logger;
    options: Options;
}
