import { GenerationContext } from ".";
import { DispatchOperation } from "./index";
import { camelCase, pascalCase } from "change-case";

/**
 * Enumeration tags for quick type discrimination via `switch`.
 *
 * These will use conventional ANSI SQL naming rather than database
 * specific catalog naming.
 */
export const enum ASTKind {
  Node,
  Database,
  Schema,
  Tables,
  Table,
  Column,
  Index,
  IndexColumn,
}

/**
 * Nameable items, which is going to be nearly everything
 * in the database.
 */
export interface IsNamed {
  name: string;
}

export function isNamed(node: ASTNode | IsNamed): node is IsNamed {
  return (node as IsNamed).name !== undefined;
}

/**
 * Some nodes are containers.
 */
export interface IsContainer extends IsNamed {
  children: ASTNode[];
}

export function isContainer(node: ASTNode | IsContainer): node is IsContainer {
  return (node as IsContainer).children !== undefined;
}

/**
 * Use this to visit and generate code.
 */
interface VisitationHandler<T extends ASTNode> {
  (context: GenerationContext, node: T): Promise<string>;
}

/**
 * Visitation has a scoped:
 * - before
 * - recursive visitation
 * - after
 *
 * This lets you create blocked scope generation easily.
 */
export interface Visitor<T extends ASTNode> {
  before?: VisitationHandler<T>;
  after?: VisitationHandler<T>;
}

/**
 * And a big old map of visitors for each node type.
 */
export type VisitorMap = {
  [ASTKind.Node]?: Visitor<ASTNode>;
  [ASTKind.Database]?: Visitor<DatabaseNode>;
  [ASTKind.Schema]?: Visitor<SchemaNode>;
  [ASTKind.Table]?: Visitor<TableNode>;
  [ASTKind.Tables]?: Visitor<TableNode>;
  [ASTKind.Column]?: Visitor<ColumnNode>;
  [ASTKind.Index]?: Visitor<IndexNode>;
  [ASTKind.IndexColumn]?: Visitor<IndexColumnNode>;
};

/**
 * Classic AST, everything is at least a node with a `kind`
 * and optional `parent`.
 *
 * The root of the tree will have `parent === undefined`.
 */
export abstract class ASTNode {
  constructor(
    public kind: ASTKind,
    public parent?: ASTNode,
  ) {}

  async visit<T extends this>(context: GenerationContext): Promise<string> {
    const generationBuffer = [""];
    const visitor = context.handlers?.[this.kind] as Visitor<typeof this>;
    generationBuffer.push(
      visitor?.before ? await visitor?.before(context, this as T) : "",
    );

    generationBuffer.push(
      visitor?.after ? await visitor?.after(context, this as T) : "",
    );

    return generationBuffer.filter((line) => line).join("\n");
  }

  dispatchName(operation: DispatchOperation = ""): string {
    return operation;
  }
}

/**
 * Represents a database as an AST for code generation.
 */
export abstract class ContainerNode
  extends ASTNode
  implements IsNamed, IsContainer
{
  children: ASTNode[] = [];
  constructor(
    public name: string,
    kind: ASTKind,
    parent?: ASTNode,
  ) {
    super(kind, parent);
  }

  async visit<T extends this>(context: GenerationContext): Promise<string> {
    const generationBuffer = [""];
    const visitor = context.handlers?.[this.kind] as Visitor<typeof this>;
    generationBuffer.push(
      visitor?.before ? await visitor?.before(context, this as T) : "",
    );

    // and here is that recursion
    for (const child of this.children) {
      generationBuffer.push(await child.visit(context));
    }

    generationBuffer.push(
      visitor?.after ? await visitor?.after(context, this as T) : "",
    );

    return generationBuffer.filter((line) => line).join("\n");
  }
}

/**
 * Represents a database as an AST for code generation.
 */
export class DatabaseNode extends ContainerNode {
  constructor(public name: string) {
    super(name, ASTKind.Database);
  }
}

/**
 * Represents a single schema of a single database.
 *
 * This is the fundamental 'container' type that scopes a database
 * AST, particularly since there are not nested SCHEMA in ANSI SQL.
 */
export class SchemaNode extends ContainerNode {
  constructor(
    database: DatabaseNode,
    public name: string,
  ) {
    super(name, ASTKind.Schema, database);
  }

  async visit(context: GenerationContext): Promise<string> {
    if (context?.skipSchemas?.includes(this.name)) {
      return "";
    } else {
      return super.visit(context);
    }
  }

  dispatchName(operation: DispatchOperation = "") {
    return `${pascalCase(this.name)}${operation}`;
  }
}

/**
 * Collects all tables in a schema in a database.
 */
export class TablesNode extends ContainerNode {
  constructor(schema: SchemaNode) {
    super("Tables", ASTKind.Tables, schema);
  }

  dispatchName(operation: DispatchOperation = "") {
    return this.parent?.dispatchName(operation) ?? "";
  }
}

/**
 * Represents a single table in a schema in a database.
 *
 * This is for 'real' tables, the normal old thing you would call
 * a table in SQL. Not a view, not a reltype, but a place were rows go to 🛌.
 */
export class TableNode extends ContainerNode {
  constructor(
    tables: TablesNode,
    public name: string,
  ) {
    super(name, ASTKind.Table, tables);
  }

  dispatchName(operation: DispatchOperation = "") {
    return `${this.parent?.dispatchName()}.${pascalCase(
      this.name,
    )}${operation}`;
  }

  get primaryKey(): IndexNode | undefined {
    return this.children.find((n) => (n as IndexNode).primaryKey) as IndexNode;
  }
}

/**
 * A single column on a single table in a schema in a database.
 */
export class ColumnNode extends ContainerNode {
  constructor(
    table: TableNode,
    public name: string,
  ) {
    super(name, ASTKind.Column, table);
  }
}

/**
 * A single index on a single table in a schema in a database.
 */
export class IndexNode extends ContainerNode {
  constructor(
    table: TableNode,
    public name: string,
    public unique: boolean,
    public primaryKey: boolean,
  ) {
    super(name, ASTKind.Index, table);
  }

  dispatchName(operation: DispatchOperation = "") {
    return `${this.parent?.dispatchName()}.${camelCase(this.name)}${operation}`;
  }

  get columns(): IndexColumnNode[] {
    return this.children.filter(
      (n) => n.kind === ASTKind.IndexColumn,
    ) as IndexColumnNode[];
  }
}

/**
 * A single column on a single index in a schema in a database.
 */
export class IndexColumnNode extends ContainerNode {
  constructor(
    table: IndexNode,
    public name: string,
  ) {
    super(name, ASTKind.IndexColumn, table);
  }
}
