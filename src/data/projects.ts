export type ProjectStatus = "Planning" | "In Progress" | "Published";

export const projects = [
  {
    title: "Personal Site System",
    status: "In Progress" as ProjectStatus,
    description: "用于展示个人项目、学业进度、公开计划和专业方向的长期个人站。",
    tech: ["Astro", "TypeScript", "Tailwind CSS"],
    href: "#"
  },
  {
    title: "Aerospace Study Dashboard",
    status: "Planning" as ProjectStatus,
    description: "把课程、毕业要求和阶段计划整理成可视化进度面板。",
    tech: ["Data", "Dashboard", "Education"],
    href: "#"
  },
  {
    title: "Future Project Placeholder",
    status: "Planning" as ProjectStatus,
    description: "预留给未来的工程、科研、课程或个人实验项目。",
    tech: ["Research", "Prototype", "Documentation"],
    href: "#"
  }
];
