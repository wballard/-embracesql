import { Context } from "../../context";
import { groupBy } from "../../util";
import { PGTypeComposite } from "./pgtypecomposite";
import { camelCase } from "change-case";
import * as path from "path";
import { Sql } from "postgres";

type AttributeRow = {
  attnum: number;
  attrelid: number;
  atttypid: number;
  attname: string;
  attnotnull: boolean;
};

/**
 * All attributes in the postgres catalog.
 */
export class PGAttributes {
  static async factory(sql: Sql) {
    const attributes = (await sql.file(
      path.join(__dirname, "pgattributes.sql"),
    )) as unknown as AttributeRow[];
    return new PGAttributes(attributes);
  }

  public attributesByRelid: Record<number, PGAttribute[]>;
  private constructor(attributes: AttributeRow[]) {
    this.attributesByRelid = groupBy(
      attributes,
      (r) => r.attrelid,
      (r) => new PGAttribute(r),
    );
  }

  attributesForType(catalogType: PGTypeComposite) {
    return (
      this.attributesByRelid[catalogType.catalog.typrelid]?.sort(
        (l, r) => l.attribute.attnum - r.attribute.attnum,
      ) ?? []
    );
  }
}

/**
 * Table and composite types have attributes, or as they are called
 * in real life -- columns.
 *
 */
export class PGAttribute {
  constructor(public attribute: AttributeRow) {}

  get name() {
    return this.attribute.attname;
  }

  get typescriptName() {
    // camel case -- this is a 'property like'
    return `${camelCase(this.attribute.attname)}`;
  }

  typescriptTypeDefinition(context: Context) {
    // nullability, but otherwise delegate to the type of the attribute
    const underlyingType =
      context
        .resolveType(this.attribute.atttypid)
        ?.typescriptNameWithNamespace(context) ?? "void";
    if (this.attribute.attnotnull) {
      return underlyingType;
    } else {
      return `Nullable<${underlyingType}>`;
    }
  }
}
