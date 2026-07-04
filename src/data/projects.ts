export type ProjectStatus = "Planning" | "In Progress" | "Published";

export const projects = [
  {
    title: "LiShihhsing Personal Site",
    status: "Published" as ProjectStatus,
    description:
      "A personal website for project links, academic progress, public plans, and contact information.",
    tech: ["Astro", "TypeScript", "Cloudflare Pages"],
    href: "https://lishihhsing-personal-site.pages.dev/"
  },
  {
    title: "kaoyan-daily-checkin",
    status: "In Progress" as ProjectStatus,
    description:
      "A daily check-in project for tracking postgraduate entrance exam preparation, study habits, and ongoing progress.",
    tech: ["GitHub", "Study Plan", "Daily Check-in"],
    href: "https://kaoyan-daily-checkin.pages.dev/"
  },
  {
    title: "Future Project Placeholder",
    status: "Planning" as ProjectStatus,
    description: "Reserved for future engineering, research, coursework, or personal experiment projects.",
    tech: ["Research", "Prototype", "Documentation"],
    href: "#"
  }
];
