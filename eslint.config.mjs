import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // @opennextjs/cloudflare 的构建产物（内含整个 Next.js 服务端 bundle）
      ".open-next/**",
      // wrangler 的本地状态目录，其中的 tmp/dev-* 是本地预览时生成的
      // 巨型临时打包文件；不忽略会让 ESLint 直接 OOM
      ".wrangler/**",
      // 生成物类型声明
      "cloudflare-env.d.ts",
      // Serwist 在构建时生成的产物，不参与源码检查
      "public/sw.js",
      "public/swe-worker-*.js",
    ],
  },
];

export default eslintConfig;
