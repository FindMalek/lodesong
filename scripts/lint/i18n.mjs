const ATTRIBUTES = new Set(["title", "aria-label", "placeholder", "alt", "label"]);
const LETTERS = /\p{L}/u;

/** A file that imports `t` or `useT` from `@/lib/i18n` has been translated: no new English literals in its JSX, use `t()`. */
const noLiteralText = {
  meta: { type: "problem", docs: { description: "No literal user-facing text in components that use @/lib/i18n" } },
  create(context) {
    let translated = false;
    const report = (node, text) =>
      context.report({
        node,
        message: `Literal text "${text.trim().slice(0, 40)}" in a translated component: add it to locales/en.json and use t().`,
      });
    return {
      ImportDeclaration(node) {
        if (node.source.value === "@/lib/i18n" && node.specifiers.some((item) => ["t", "useT"].includes(item.imported?.name)))
          translated = true;
      },
      JSXText(node) {
        if (translated && LETTERS.test(node.value)) report(node, node.value);
      },
      JSXAttribute(node) {
        if (translated && ATTRIBUTES.has(node.name.name) && node.value?.type === "Literal" && LETTERS.test(String(node.value.value)))
          report(node, String(node.value.value));
      },
    };
  },
};

export default { meta: { name: "i18n" }, rules: { "no-literal-text": noLiteralText } };
