import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm", "cjs"],
	dts: true,
	sourcemap: true,
	clean: true,
	splitting: false,
	external: ["react", "react-dom", "@ericblade/quagga2"],
	banner: {
		// preserved for each output — both hooks touch the DOM directly and
		// must not be evaluated as a React Server Component.
		js: '"use client";',
	},
});
