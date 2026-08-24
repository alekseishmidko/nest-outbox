export type SqlValue = string | number | Date | null;

export type SqlFragment = {
  sql: string;
  params: SqlValue[];
};

export interface Specification {
  toSql(): SqlFragment;
}

export function and(...specifications: Specification[]): Specification {
  return compose('AND', specifications);
}

export function or(...specifications: Specification[]): Specification {
  return compose('OR', specifications);
}

export function not(specification: Specification): Specification {
  return {
    toSql: () => {
      const fragment = specification.toSql();
      return { sql: `NOT (${fragment.sql})`, params: fragment.params };
    },
  };
}

function compose(
  operator: 'AND' | 'OR',
  specifications: Specification[],
): Specification {
  return {
    toSql: () => {
      const fragments = specifications.map((specification) =>
        specification.toSql(),
      );
      return {
        sql:
          fragments
            .map((fragment) => `(${fragment.sql})`)
            .join(` ${operator} `) || '1 = 1',
        params: fragments.flatMap((fragment) => fragment.params),
      };
    },
  };
}
