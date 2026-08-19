import { DomainError } from '../../common/domain-error';

export class ReferenceRequiredError extends DomainError {
  constructor(message: string = 'Reference transaction is required for this operation') {
    super('REFERENCE_REQUIRED', message);
  }
}
