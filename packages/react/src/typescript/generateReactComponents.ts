import {
  ASTKind,
  GenerationContext,
  IsNamed,
  NamespaceVisitor,
} from "@embracesql/shared";
import { camelCase, pascalCase } from "change-case";

/**
 * Generate the connection between React and EmbraceSQL HTTP/S services.
 */
export const generateReactComponents = async (context: GenerationContext) => {
  const generationBuffer = [
    `// Begin React generated section`,
    `import React from "react";`,
    `export { EmbraceSQLClient, EmbraceSQLProvider } from "@embracesql/react";`,
    `import { useEmbraceSQLRequest, useEmbraceSQLUpdateCallback, InterceptorCallback, Intercepted, ChangeEvent } from "@embracesql/react";`,
  ];

  // generate per table return type interceptors - these are used to have
  // self updating hooked values
  context.handlers = {
    [ASTKind.Schema]: NamespaceVisitor,
    [ASTKind.Table]: {
      before: async (_, node) => {
        const tableTypeName = `${pascalCase(
          (node as unknown as IsNamed)?.name,
        )}`;
        const generationBuffer = [""];
        generationBuffer.push(
          `export function ${tableTypeName}Interceptor(uninterceptedValue: ${tableTypeName}, callback: InterceptorCallback<${tableTypeName}>, index?: number) : Intercepted<${tableTypeName}>{`,
        );
        generationBuffer.push(`const ret = {`);

        return generationBuffer.join("\n");
      },
      after: async () => {
        return `
          };
          return ret;
        }
          `;
      },
    },
    [ASTKind.Column]: {
      before: async (_, node) => {
        const tableTypeName = `${pascalCase(
          (node.parent as unknown as IsNamed)?.name,
        )}`;
        const generationBuffer = [""];
        generationBuffer.push(
          `get ${camelCase(
            node.name,
          )}() { return uninterceptedValue.${camelCase(node.name)};},`,
        );
        // the setter -- this sets a local memory value and triggers the callback
        // that intercepts sets
        generationBuffer.push(`set ${camelCase(node.name)}(newValue) {`);
        generationBuffer.push(
          `uninterceptedValue.${camelCase(node.name)} = newValue;`,
        );
        generationBuffer.push(`void callback(uninterceptedValue, index);`);
        generationBuffer.push(`},`);
        // react change event handlers
        generationBuffer.push(
          `change${pascalCase(node.name)}(event: ChangeEvent) {`,
        );
        // TODO: this needs generated type casts from string -> actual no shit value
        generationBuffer.push(
          `ret.${camelCase(
            node.name,
          )} = event.target.value as unknown as ${tableTypeName}["${camelCase(
            node.name,
          )}"] ;`,
        );
        generationBuffer.push(`},`);
        return generationBuffer.join("\n");
      },
    },
  };
  generationBuffer.push(await context.database.visit(context));

  // the read hooks
  context.handlers = {
    [ASTKind.Schema]: NamespaceVisitor,
    [ASTKind.Table]: NamespaceVisitor,
    [ASTKind.Tables]: NamespaceVisitor,
    [ASTKind.Column]: NamespaceVisitor,
    [ASTKind.Index]: {
      before: async (_, node) => {
        const tableTypeName = `${pascalCase(
          (node.parent?.parent?.parent as unknown as IsNamed)?.name,
        )}.${pascalCase((node.parent as unknown as IsNamed)?.name)}`;
        const resultsTypeName = `${tableTypeName}${node.unique ? "" : "[]"}`;
        const generationBuffer = [""];
        generationBuffer.push(
          `export function use${pascalCase(node.name)}(parameters: ${pascalCase(
            node.name,
          )}) {`,
        );

        // request - this is the actual doing
        generationBuffer.push(`const request = {`);
        generationBuffer.push(`operation: "${node.dispatchName()}",`);
        generationBuffer.push(`parameters,`);
        generationBuffer.push(`}`);
        // dispatching the request
        generationBuffer.push(
          `const done = useEmbraceSQLRequest<${pascalCase(
            node.name,
          )}, never, ${resultsTypeName}>(request);`,
        );
        // capturing results from responses
        generationBuffer.push(
          `const [results, setResults] = React.useState<${resultsTypeName}>();`,
          `React.useEffect(() => {`,
          `setResults(done?.response?.results)`,
          `}, [done?.response]);`,
        );
        // callback on updates
        generationBuffer.push(
          `const updateCallback = useEmbraceSQLUpdateCallback<${tableTypeName}, ${resultsTypeName}>({operation: "${node.parent?.dispatchName(
            ".create",
          )}", results, setResults});`,
        );
        // buffer up intercepted responses
        generationBuffer.push(
          `const [interceptedResults, setInterceptedResults] = React.useState<Intercepted<${tableTypeName}>${
            node.unique ? "" : "[]"
          }>();`,
        );

        generationBuffer.push(`React.useEffect(() => {`);
        generationBuffer.push(`if (done?.response?.results) {`);
        // result type, with setters attached
        if (node.unique) {
          generationBuffer.push(
            `setInterceptedResults(${tableTypeName}Interceptor(done.response.results, updateCallback));`,
          );
        } else {
          generationBuffer.push(
            `setInterceptedResults((results ?? []).map((r, i) => ${tableTypeName}Interceptor(r, updateCallback, i)));`,
          );
        }
        generationBuffer.push(`} else { setResults(undefined);}`);
        generationBuffer.push(`}, [results])`);

        // and the hook return all merged up -- note we're returning the
        // intercepted wrapper results
        generationBuffer.push(`
            return {
                loading: done?.loading,
                error: done?.error,
                results: interceptedResults,
            };
            `);

        return generationBuffer.join("\n");
      },
      after: async () => {
        return `}`;
      },
    },
  };

  // laying out schemas and tables as namespaces
  generationBuffer.push(await context.database.visit(context));
  // close off Hooks namespace
  generationBuffer.push(`// End React generated section`);
  return generationBuffer.join("\n");
};
