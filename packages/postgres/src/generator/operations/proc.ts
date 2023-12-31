import { GenerationContext } from "..";
import { PGProc } from "../pgtype/pgproc/pgproc";
import { Operation } from "./operation";

/**
 * A single proc.
 */
export class ProcOperation implements Operation {
  constructor(private proc: PGProc) {}

  dispatchName(context: GenerationContext): string {
    const namespace = context.namespaces.find(
      (n) => n.nspname === this.proc.nspname,
    );
    return `${namespace?.typescriptName}.${this.proc.typescriptName}`;
  }

  typescriptValuesType(context: GenerationContext) {
    console.assert(context);
    return undefined;
  }

  typescriptParametersType(context: GenerationContext) {
    console.assert(context);
    return this.proc.typescriptNameForPostgresArguments(true);
  }

  async build(context: GenerationContext) {
    // currently nothing to do here
    console.assert(context);
  }

  typescriptDefinition(context: GenerationContext): string {
    const generationBuffer = [
      ` async ${
        this.proc.typescriptName
      }(parameters : ${this.typescriptParametersType(context)}){`,
    ];
    // and the call body
    generationBuffer.push(`
              console.assert(parameters);
              const sql = this.database.context.sql;
              const typed = sql.typed as unknown as PostgresTypecasts;
              const response = (await sql.begin(async (sql: postgres.Sql) => {
                  return await sql\`
                  SELECT
                  ${
                    this.proc.postgresName
                  }${this.proc.typescriptProcedureCallArguments(context)};
                  \`
              }));
              const results = response;
              const responseBody = ( ${(() => {
                // pseudo record -- which is always a table type but needs more parsing
                if (this.proc.returnsPseudoTypeRecord) {
                  return `results.map(x => this.parse${this.proc.typescriptName}Result(this.database.context, x.${this.proc.resultsetName}))`;
                }
                // table cast of a defined type
                if (this.proc.returnsSet) {
                  return `results.map(x => x.${this.proc.resultsetName})`;
                }
                // pick out the scalar case
                return `results?.[0].${this.proc.resultsetName}`;
              })()} ) as unknown as ${this.proc.typescriptNameForPostgresResult(
                true,
              )};
              return responseBody;

    `);
    generationBuffer.push(`}`);
    // parser
    if (this.proc.returnsPseudoTypeRecord) {
      generationBuffer.push(`
            const parse${this.proc.typescriptName}Result = (context: Context,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              result: any) : ${this.proc.typescriptNameForPostgresResultsetRecord(
                true,
              )} => {
              return context.procTypes.${
                this.proc.postgresMarshallName
              }.parseFromPostgresIfRecord(context, result) as unknown as ${this.proc.typescriptNameForPostgresResultsetRecord(
                true,
              )};
            } 
     `);
    }
    return generationBuffer.join("\n");
  }
}
