import type { ExtensionFactory } from "../extensions/index.ts";
import type { ResourceLoaderExtensionFactory } from "../resource-loader.ts";
import presentationExtension from "./presentation.ts";

export type BuiltinExtensionFactory = {
	path: string;
	factory: ExtensionFactory;
};

const builtinExtensionFactories: BuiltinExtensionFactory[] = [
	{
		path: "<builtin:presentation>",
		factory: presentationExtension,
	},
];

export function mergeBuiltinExtensionFactories(options?: {
	noExtensions?: boolean;
	extensionFactories?: ResourceLoaderExtensionFactory[];
}): ResourceLoaderExtensionFactory[] {
	const customFactories = options?.extensionFactories ?? [];
	return options?.noExtensions ? customFactories : [...builtinExtensionFactories, ...customFactories];
}
