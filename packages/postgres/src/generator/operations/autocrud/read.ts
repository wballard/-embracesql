import { GenerationContext } from "../..";
import { PGTable } from "../../pgtype/pgtable";
import { PGTypeComposite } from "../../pgtype/pgtypecomposite";
import { TableIndexOperation, TableIndexOperations } from "../table";
import { camelCase } from "change-case";

/**
 * AutoCRUD reads by index for a table.
 */
export class ReadOperations extends TableIndexOperations {
  constructor(public table: PGTable) {
    super(table, ReadOperation);
  }
}

class ReadOperation extends TableIndexOperation {
  typescriptParametersType(context: GenerationContext) {
    const tableType = context.resolveType<PGTypeComposite>(
      this.table.table.tabletypeoid,
    );
    const namespace = context.namespaces.find(
      (n) => n.nspname === this.table.table.nspname,
    );
    return `${namespace?.typescriptName}.Tables.${tableType.typescriptName}.${this.index.typescriptName}`;
  }

  typescriptDefinition(context: GenerationContext): string {
    const generationBuffer = [""];
    const tableType = context.resolveType<PGTypeComposite>(
      this.table.table.tabletypeoid,
    );
    const parameters = `parameters: ${this.typescriptParametersType(context)}`;

    generationBuffer.push(
      `async ${camelCase(
        this.index.typescriptName,
      )}(${parameters}) : ${this.typescriptReturnType(context)}{`,
    );
    generationBuffer.push(
      `
      console.assert(parameters);
      const sql = this.database.context.sql;
      const typed = sql.typed as unknown as PostgresTypecasts;
      `,
    );
    // query using postgres driver bindings to the index
    const sql = `SELECT ${tableType.sqlColumns(context)} FROM ${
      tableType.postgresName
    } WHERE ${this.index.sqlPredicate(context)}`;
    generationBuffer.push(`const response = await sql\`${sql}\``);

    generationBuffer.push(
      this.typescriptTableReturnStatementsFromResponse(context),
    );

    generationBuffer.push(`}`);

    return generationBuffer.join("\n");
  }
}
