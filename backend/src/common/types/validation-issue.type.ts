/**
 * Описание ошибки валидации одного поля DTO.
 */
export type ValidationIssue = {
  property: string;
  constraints: string[];
  children?: ValidationIssue[];
};
