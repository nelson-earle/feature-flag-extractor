import * as ts from 'typescript';
import { ProjectService } from '../project-service';

export function buildMockProjectService(
    typeChecker: ts.TypeChecker
): jest.MockedObject<ProjectService> {
    return {
        getProgram: jest.fn(),
        getTypeChecker: jest.fn().mockReturnValue(typeChecker),
        resolveTypeInTemplateAtPosition: jest.fn(),
    } as Partial<ProjectService> as jest.MockedObject<ProjectService>;
}
