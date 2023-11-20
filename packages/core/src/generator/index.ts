import { Context } from "../context";
import {
  generateProcCalls,
  generateSchemaDefinitions,
  generateDatabaseRoot,
  generateSqlScriptCalls,
} from "./typescript";
import * as fs from "fs/promises";

/**
 * Shared context for the generation sequence.
 *
 * This combines our regular context to connect and work with
 * postgres along with needed metadata.
 */
export type GenerationContext = Context & {
  generateInto: string;
  sqlScriptsFrom: string;
};

/**
 * The generator looks to the database api schema and creates:
 * - TypeScript for each database type
 * - OpenAPI controller endpoints for each database procedure
 */
export const regenerateFromDatabase = async (context: GenerationContext) => {
  // smoke em so we get a clean generation
  try {
    await fs.stat(context.generateInto);
    await fs.rm(context.generateInto, { recursive: true });
  } catch {
    // does not exist -- carry on
  } finally {
    await fs.mkdir(context.generateInto, { recursive: true });
  }

  // pure types
  await generateSchemaDefinitions(context);

  // generating each of the database operations
  await generateProcCalls(context);
  await generateSqlScriptCalls(context);

  // and this the actual object 'root' used to access the database
  await generateDatabaseRoot(context);
};
