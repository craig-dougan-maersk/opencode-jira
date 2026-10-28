import { createRenderer } from "solid-js/universal";

export interface TestNode {
  type: string;
  text?: string;
  props: Record<string, unknown>;
  children: TestNode[];
  parent?: TestNode;
}

export function use(fn: Function, node: TestNode, value: unknown) {
  Object.assign(node, {
    scrollTop: 0,
    scrollLeft: 0,
    plainText: "",
    focus() {},
    blur() {},
    scrollBy(delta: number | { x: number; y: number }) {
      (node as any).scrollTop += typeof delta === "number" ? delta : delta.y;
    },
    scrollTo(position: { x: number; y: number }) {
      (node as any).scrollTop = position.y;
      (node as any).scrollLeft = position.x;
    },
    scrollChildIntoView() {},
  });
  fn(node, value);
}

export const {
  render,
  effect,
  memo,
  createComponent,
  createElement,
  createTextNode,
  insertNode,
  insert,
  spread,
  setProp,
  mergeProps,
} = createRenderer<TestNode>({
  createElement: (type) => ({ type, props: {}, children: [] }),
  createTextNode: (text) => ({ type: "#text", text, props: {}, children: [] }),
  replaceText: (node, text) => {
    node.text = text;
  },
  setProperty: (node, name, value) => {
    node.props[name] = value;
  },
  insertNode(parent, node, anchor) {
    if (node.parent) this.removeNode(node.parent, node);
    node.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, node);
  },
  removeNode(parent, node) {
    parent.children.splice(parent.children.indexOf(node), 1);
    node.parent = undefined;
  },
  getParentNode: (node) => node.parent,
  getFirstChild: (node) => node.children[0],
  getNextSibling: (node) =>
    node.parent?.children[node.parent.children.indexOf(node) + 1],
  isTextNode: (node) => node.type === "#text",
});
