import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'], // Construit pour Node.js ET le Navigateur
    dts: true, // Génère les fichiers de définition de type (.d.ts)
    splitting: false,
    sourcemap: true,
    clean: true,
});