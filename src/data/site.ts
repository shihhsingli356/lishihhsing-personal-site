export type Lang = "zh" | "en";

export const defaultLang: Lang = "zh";

export const languageNames: Record<Lang, string> = {
  zh: "中文",
  en: "EN"
};

export const htmlLang: Record<Lang, string> = {
  zh: "zh-CN",
  en: "en"
};

export function getLangFromPath(pathname: string): Lang {
  return pathname === "/en" || pathname.startsWith("/en/") ? "en" : "zh";
}

export function basePath(pathname: string): string {
  const pathOnly = pathname.split("?")[0]?.split("#")[0] || "/";
  let path = pathOnly.replace(/\/+$/, "") || "/";

  if (path === "/en") {
    return "/";
  }

  if (path.startsWith("/en/")) {
    path = path.slice(3) || "/";
  }

  return path || "/";
}

export function localizePath(pathname: string, lang: Lang): string {
  const path = basePath(pathname);
  if (lang === "en") {
    return path === "/" ? "/en/" : `/en${path}`;
  }

  return path;
}

export function languageSwitchPath(pathname: string, currentLang: Lang): string {
  return localizePath(pathname, currentLang === "zh" ? "en" : "zh");
}

const routes = [
  { path: "/", key: "home" },
  { path: "/about", key: "about" },
  { path: "/projects", key: "projects" },
  { path: "/education", key: "education" },
  { path: "/plans", key: "plans" }
] as const;

export const site = {
  zh: {
    metaDescription: "LiShihhsing 的个人站，用于展示项目、学业进度、公开计划和专业方向。",
    nav: {
      brand: "LiShihhsing",
      menu: "菜单",
      languageLabel: "EN",
      links: routes.map((route) => ({
        path: route.path,
        label:
          route.key === "home"
            ? "首页"
            : route.key === "about"
              ? "关于"
              : route.key === "projects"
                ? "项目"
                : route.key === "education"
                  ? "学业"
                  : "计划"
      }))
    },
    profile: {
      name: "LiShihhsing",
      tagline: "LiShihhsing 的个人站",
      role: "学生",
      field: "航空航天工程",
      school: "上海交通大学",
      enrollmentYear: "2022",
      expectedGraduation: "2027",
      location: "Shanghai, China",
      summary:
        "上海交通大学航空航天工程学生，关注航空航天工程、大模型与多模态处理、全栈工程和金融量化方向。这个网站用于长期整理我的项目、课程进度、公开计划和阶段性成果。"
    },
    socials: [
      {
        label: "GitHub",
        href: "https://github.com/shihhsingli356",
        description: "项目代码与工程实践"
      },
      {
        label: "Gmail",
        href: "mailto:shihhsingli356@gmail.com",
        description: "个人联系邮箱"
      },
      {
        label: "SJTU Email",
        href: "mailto:li-shih-hsing@sjtu.edu.cn",
        description: "学校邮箱"
      },
      {
        label: "Bilibili",
        href: "https://space.bilibili.com/295562144",
        description: "视频与公开内容"
      }
    ],
    education: {
      major: "航空航天工程",
      school: "上海交通大学",
      enrollmentYear: 2022,
      expectedGraduation: 2027,
      totalCourses: 100,
      completedCourses: 90,
      remainingCourses: 10
    },
    courses: [
      {
        name: "工程力学",
        category: "专业基础",
        credits: 3,
        status: "已完成",
        term: "2023 Fall",
        done: true
      },
      {
        name: "流体力学",
        category: "专业核心",
        credits: 3,
        status: "已完成",
        term: "2024 Spring",
        done: true
      },
      {
        name: "飞行器结构",
        category: "专业核心",
        credits: 3,
        status: "进行中",
        term: "2026 Spring",
        done: false
      },
      {
        name: "控制理论基础",
        category: "专业核心",
        credits: 3,
        status: "待修",
        term: "TBD",
        done: false
      },
      {
        name: "毕业设计",
        category: "毕业要求",
        credits: 8,
        status: "待修",
        term: "2027 Spring",
        done: false
      }
    ],
    projects: [
      {
        title: "LiShihhsing Personal Site",
        status: "已发布",
        description: "用于展示个人项目、学业进度、公开计划和联系方式的长期个人站。",
        tech: ["Astro", "TypeScript", "Cloudflare Pages"],
        href: "https://lishihhsing-personal-site.pages.dev/"
      },
      {
        title: "kaoyan-daily-checkin",
        status: "进行中",
        description: "考研每日打卡计划，用于记录备考进度、学习习惯和阶段性复盘。",
        tech: ["GitHub", "Study Plan", "Daily Check-in"],
        href: "https://kaoyan-daily-checkin.pages.dev/"
      },
      {
        title: "Future Project Placeholder",
        status: "规划中",
        description: "预留给未来的工程、科研、课程或个人实验项目。",
        tech: ["Research", "Prototype", "Documentation"],
        href: "#"
      }
    ],
    plans: [
      {
        phase: "Now",
        title: "个人网站第一版",
        items: ["完善网站结构", "整理项目入口", "建立课程进度面板"]
      },
      {
        phase: "Next",
        title: "内容替换与项目细化",
        items: ["补充真实项目链接", "更新个人简介与照片", "整理课程清单"]
      },
      {
        phase: "Later",
        title: "长期公开路线图",
        items: ["增加文章或笔记", "加入项目详情页", "探索自动同步课程或计划数据"]
      },
      {
        phase: "Done",
        title: "已完成事项",
        items: ["确认网站定位", "确定技术路线", "收集第一版基础资料"]
      }
    ],
    home: {
      title: "LiShihhsing | 个人站",
      heroLabel: "航空航天工程 / 个人系统",
      viewProjects: "查看项目",
      educationDashboard: "学业仪表盘",
      role: "身份",
      school: "学校",
      location: "地点",
      academicSnapshot: "学业概览",
      major: "专业",
      expectedGraduation: "预计毕业",
      courseProgress: "课程进度",
      selectedWork: "精选项目",
      projectIndex: "项目索引",
      allProjects: "全部项目",
      publicRoadmap: "公开路线图",
      publicPlans: "公开计划",
      roadmapDescription: "用于展示当前工作、下一步计划和公开进展的轻量路线图。",
      contact: "联系",
      socialLinks: "社交帐号与联系方式"
    },
    about: {
      title: "关于 | LiShihhsing",
      label: "关于",
      headline: "你好，我是 LiShihhsing。",
      portraitAlt: "LiShihhsing 的个人照片",
      portraitCaptionLeft: "LiShihhsing",
      portraitCaptionRight: "上海交通大学",
      identityCards: [
        {
          label: "当前身份",
          title: "航空航天工程学生",
          body: "就读于上海交通大学，同时把课程、项目和计划整理成可长期维护的公开档案。"
        },
        {
          label: "方向",
          title: "航空航天 / 全栈 / 量化",
          body: "把工程基础、软件系统、AI 工作流和量化研究工具连接起来。"
        },
        {
          label: "当前关注",
          title: "学习与执行系统",
          body: "维护项目链接、课程追踪、公开路线图和每日打卡工作流。"
        }
      ],
      focusLabel: "关注方向",
      focusTitle: "我正在长期建设的方向",
      focusAreas: [
        {
          title: "航空航天工程",
          body: "围绕力学、控制、推进、结构、数据分析和飞行器相关系统建立工程基础。",
          tags: ["Mechanics", "Control", "Data Analysis"]
        },
        {
          title: "大模型与多模态处理",
          body: "关注语言模型、多模态理解和 AI 辅助工作流如何支持学习、研究和产品工具。",
          tags: ["LLM", "Multimodal", "AI Workflow"]
        },
        {
          title: "全栈工程",
          body: "从界面到部署构建实用 Web 系统，关注可维护性、数据结构和可用的产品表面。",
          tags: ["Frontend", "Backend", "Deployment"]
        },
        {
          title: "金融量化",
          body: "探索系统化交易、市场数据工作流、回测和策略执行，作为技术研究方向。",
          tags: ["Quant Research", "Backtesting", "MT5"]
        }
      ],
      timelineLabel: "时间线",
      timelineTitle: "教育经历与方向",
      timelineDescription: "这里记录我的学业路径，以及影响这个网站长期内容结构的方向。",
      timeline: [
        {
          year: "2022",
          title: "进入上海交通大学",
          body: "开始在上海交通大学本科阶段学习。"
        },
        {
          year: "2022 - 2024",
          title: "上海交通大学医学院护理学专业",
          body: "在上海交通大学医学院就读护理学专业，同期开展个人创业项目。"
        },
        {
          year: "2024 - 至今",
          title: "航空航天工程",
          body: "转向航空航天工程方向，同时继续建设软件工具、学习系统、AI 工作流和量化研究兴趣。"
        },
        {
          year: "2027",
          title: "预计毕业",
          body: "预计从上海交通大学本科毕业。"
        }
      ],
      toolsLabel: "工具",
      toolsTitle: "技能、工具与工作系统",
      toolGroups: [
        {
          title: "Engineering",
          items: ["Aerospace Engineering", "Mechanics", "Control", "Data Analysis", "Numerical Methods"]
        },
        {
          title: "Web & Software",
          items: ["Astro", "TypeScript", "Tailwind CSS", "Python", "GitHub", "Cloudflare Pages", "API Workflows"]
        },
        {
          title: "AI & Multimodal",
          items: ["Large Language Models", "Multimodal Processing", "Prompted Workflows", "AI-Assisted Tooling"]
        },
        {
          title: "Quant & Trading",
          items: ["Quantitative Research", "Backtesting", "Market Data", "MT5", "Strategy Tracking"]
        },
        {
          title: "Workflow",
          items: ["Daily Check-in", "Course Tracking", "Public Roadmap", "Personal Dashboard"]
        }
      ],
      contact: "联系",
      socialLinks: "社交帐号与联系方式"
    },
    projectsPage: {
      title: "项目 | LiShihhsing",
      label: "项目",
      heading: "项目链接",
      description: "用于整理已发布、进行中和规划中的项目。后续可以逐步替换为真实链接、截图和项目笔记。"
    },
    educationPage: {
      title: "学业 | LiShihhsing",
      label: "学业",
      heading: "学业仪表盘",
      description: "公开展示教育背景、课程进度和毕业要求。当前课程数据仍为占位。",
      remaining: "剩余",
      coursesLeft: "门课程",
      progress: "进度",
      graduationReadiness: "毕业完成度",
      placeholderData: "占位数据",
      completed: "已完成",
      listedOpen: "清单未完成",
      listedCourseCredits: "课程清单学分",
      listedCredits: "清单学分",
      completedCredits: "已完成学分",
      fromPlaceholderRows: "来自占位课程行",
      fromListedCourses: "来自课程清单",
      table: {
        course: "课程",
        category: "类别",
        credits: "学分",
        status: "状态",
        term: "学期"
      }
    },
    plansPage: {
      title: "计划 | LiShihhsing",
      label: "计划",
      heading: "公开路线图",
      description: "用于展示近期计划、年度目标、正在进行的事情和已完成事项。",
      logicLabel: "路线图逻辑",
      logic: [
        {
          title: "Now",
          body: "只列出当前真正正在推进的事项。"
        },
        {
          title: "Next",
          body: "让近期优先级保持可见，同时避免页面过载。"
        },
        {
          title: "Done",
          body: "把已完成事项保留下来，形成公开进展记录。"
        }
      ]
    }
  },
  en: {
    metaDescription:
      "LiShihhsing's personal site for projects, academic progress, public plans, and professional directions.",
    nav: {
      brand: "LiShihhsing",
      menu: "Menu",
      languageLabel: "中文",
      links: routes.map((route) => ({
        path: route.path,
        label:
          route.key === "home"
            ? "Home"
            : route.key === "about"
              ? "About"
              : route.key === "projects"
                ? "Projects"
                : route.key === "education"
                  ? "Education"
                  : "Plans"
      }))
    },
    profile: {
      name: "LiShihhsing",
      tagline: "LiShihhsing's personal site",
      role: "Student",
      field: "Aerospace Engineering",
      school: "Shanghai Jiao Tong University",
      enrollmentYear: "2022",
      expectedGraduation: "2027",
      location: "Shanghai, China",
      summary:
        "Aerospace Engineering student at Shanghai Jiao Tong University, focused on aerospace engineering, large models and multimodal processing, full-stack engineering, and quantitative finance. This site is a long-term system for organizing my projects, academic progress, public plans, and milestones."
    },
    socials: [
      {
        label: "GitHub",
        href: "https://github.com/shihhsingli356",
        description: "Code, projects, and engineering practice"
      },
      {
        label: "Gmail",
        href: "mailto:shihhsingli356@gmail.com",
        description: "Personal email"
      },
      {
        label: "SJTU Email",
        href: "mailto:li-shih-hsing@sjtu.edu.cn",
        description: "University email"
      },
      {
        label: "Bilibili",
        href: "https://space.bilibili.com/295562144",
        description: "Videos and public content"
      }
    ],
    education: {
      major: "Aerospace Engineering",
      school: "Shanghai Jiao Tong University",
      enrollmentYear: 2022,
      expectedGraduation: 2027,
      totalCourses: 100,
      completedCourses: 90,
      remainingCourses: 10
    },
    courses: [
      {
        name: "Engineering Mechanics",
        category: "Major Foundation",
        credits: 3,
        status: "Completed",
        term: "2023 Fall",
        done: true
      },
      {
        name: "Fluid Mechanics",
        category: "Major Core",
        credits: 3,
        status: "Completed",
        term: "2024 Spring",
        done: true
      },
      {
        name: "Aircraft Structures",
        category: "Major Core",
        credits: 3,
        status: "In Progress",
        term: "2026 Spring",
        done: false
      },
      {
        name: "Fundamentals of Control Theory",
        category: "Major Core",
        credits: 3,
        status: "Pending",
        term: "TBD",
        done: false
      },
      {
        name: "Graduation Project",
        category: "Graduation Requirement",
        credits: 8,
        status: "Pending",
        term: "2027 Spring",
        done: false
      }
    ],
    projects: [
      {
        title: "LiShihhsing Personal Site",
        status: "Published",
        description: "A long-term personal site for project links, academic progress, public plans, and contact information.",
        tech: ["Astro", "TypeScript", "Cloudflare Pages"],
        href: "https://lishihhsing-personal-site.pages.dev/"
      },
      {
        title: "kaoyan-daily-checkin",
        status: "In Progress",
        description:
          "A daily check-in project for tracking postgraduate entrance exam preparation, study habits, and ongoing progress.",
        tech: ["GitHub", "Study Plan", "Daily Check-in"],
        href: "https://kaoyan-daily-checkin.pages.dev/"
      },
      {
        title: "Future Project Placeholder",
        status: "Planning",
        description: "Reserved for future engineering, research, coursework, or personal experiment projects.",
        tech: ["Research", "Prototype", "Documentation"],
        href: "#"
      }
    ],
    plans: [
      {
        phase: "Now",
        title: "First Version of Personal Site",
        items: ["Complete the site structure", "Organize project entries", "Build the course progress dashboard"]
      },
      {
        phase: "Next",
        title: "Content Refinement and Project Detail",
        items: ["Add real project links", "Update profile and portrait", "Organize the course list"]
      },
      {
        phase: "Later",
        title: "Long-Term Public Roadmap",
        items: ["Add articles or notes", "Introduce project detail pages", "Explore automated course or plan data sync"]
      },
      {
        phase: "Done",
        title: "Completed Items",
        items: ["Confirmed site positioning", "Selected technical stack", "Collected first-version source material"]
      }
    ],
    home: {
      title: "LiShihhsing | Personal Site",
      heroLabel: "Aerospace Engineering / Personal System",
      viewProjects: "View Projects",
      educationDashboard: "Education Dashboard",
      role: "Role",
      school: "School",
      location: "Location",
      academicSnapshot: "Academic Snapshot",
      major: "Major",
      expectedGraduation: "Expected Graduation",
      courseProgress: "Course Progress",
      selectedWork: "Selected Work",
      projectIndex: "Project Index",
      allProjects: "All projects",
      publicRoadmap: "Public Roadmap",
      publicPlans: "Public Plans",
      roadmapDescription: "A lightweight roadmap for current work, next steps, and public progress.",
      contact: "Contact",
      socialLinks: "Social Links & Contact"
    },
    about: {
      title: "About | LiShihhsing",
      label: "About",
      headline: "Hi, I'm LiShihhsing.",
      portraitAlt: "Portrait of LiShihhsing",
      portraitCaptionLeft: "LiShihhsing",
      portraitCaptionRight: "Shanghai Jiao Tong University",
      identityCards: [
        {
          label: "Current Role",
          title: "Aerospace Engineering Student",
          body: "Studying at Shanghai Jiao Tong University and building a long-term public archive for coursework, projects, and plans."
        },
        {
          label: "Directions",
          title: "Aerospace / Full-Stack / Quant",
          body: "Connecting engineering fundamentals with software systems, AI-enabled workflows, and quantitative research tools."
        },
        {
          label: "Current Focus",
          title: "Systems for Learning",
          body: "Maintaining project links, course tracking, public roadmaps, and daily check-in workflows."
        }
      ],
      focusLabel: "Focus Areas",
      focusTitle: "What I'm Building Toward",
      focusAreas: [
        {
          title: "Aerospace Engineering",
          body: "Coursework and engineering foundations around mechanics, control, propulsion, structures, data analysis, and aircraft-related systems.",
          tags: ["Mechanics", "Control", "Data Analysis"]
        },
        {
          title: "Large Models & Multimodal Processing",
          body: "Following how language models, multimodal understanding, and AI-assisted workflows can support learning, research, and product tools.",
          tags: ["LLM", "Multimodal", "AI Workflow"]
        },
        {
          title: "Full-Stack Engineering",
          body: "Building practical web systems from interface to deployment, with attention to maintainability, data structure, and usable product surfaces.",
          tags: ["Frontend", "Backend", "Deployment"]
        },
        {
          title: "Quantitative Finance",
          body: "Exploring systematic trading, market data workflows, backtesting, and strategy execution as a technical research direction.",
          tags: ["Quant Research", "Backtesting", "MT5"]
        }
      ],
      timelineLabel: "Timeline",
      timelineTitle: "Education & Direction",
      timelineDescription: "A concise record of my academic path and the long-term directions that shape this site.",
      timeline: [
        {
          year: "2022",
          title: "Entered Shanghai Jiao Tong University",
          body: "Started undergraduate study at Shanghai Jiao Tong University."
        },
        {
          year: "2022 - 2024",
          title: "Nursing at SJTU School of Medicine",
          body: "Studied Nursing at Shanghai Jiao Tong University School of Medicine, while also working on personal entrepreneurship projects."
        },
        {
          year: "2024 - Present",
          title: "Aerospace Engineering",
          body: "Transferred focus to Aerospace Engineering, while continuing to build software tools, learning systems, AI-related workflows, and quantitative research interests."
        },
        {
          year: "2027",
          title: "Expected Graduation",
          body: "Expected to graduate from Shanghai Jiao Tong University."
        }
      ],
      toolsLabel: "Tools",
      toolsTitle: "Skills, Tools & Working Systems",
      toolGroups: [
        {
          title: "Engineering",
          items: ["Aerospace Engineering", "Mechanics", "Control", "Data Analysis", "Numerical Methods"]
        },
        {
          title: "Web & Software",
          items: ["Astro", "TypeScript", "Tailwind CSS", "Python", "GitHub", "Cloudflare Pages", "API Workflows"]
        },
        {
          title: "AI & Multimodal",
          items: ["Large Language Models", "Multimodal Processing", "Prompted Workflows", "AI-Assisted Tooling"]
        },
        {
          title: "Quant & Trading",
          items: ["Quantitative Research", "Backtesting", "Market Data", "MT5", "Strategy Tracking"]
        },
        {
          title: "Workflow",
          items: ["Daily Check-in", "Course Tracking", "Public Roadmap", "Personal Dashboard"]
        }
      ],
      contact: "Contact",
      socialLinks: "Social Links & Contact"
    },
    projectsPage: {
      title: "Projects | LiShihhsing",
      label: "Projects",
      heading: "Project Links",
      description:
        "A structured index for published, in-progress, and planned projects. Placeholder content can be replaced with real links, screenshots, and project notes later."
    },
    educationPage: {
      title: "Education | LiShihhsing",
      label: "Education",
      heading: "Education Dashboard",
      description:
        "Public overview for academic background, course progress, and graduation requirements. Current data is placeholder-only.",
      remaining: "Remaining",
      coursesLeft: "courses left",
      progress: "Progress",
      graduationReadiness: "Graduation Readiness",
      placeholderData: "placeholder data",
      completed: "Completed",
      listedOpen: "Listed Open",
      listedCourseCredits: "Listed Course Credits",
      listedCredits: "Listed Credits",
      completedCredits: "Completed Credits",
      fromPlaceholderRows: "from placeholder rows",
      fromListedCourses: "from listed courses",
      table: {
        course: "Course",
        category: "Category",
        credits: "Credits",
        status: "Status",
        term: "Term"
      }
    },
    plansPage: {
      title: "Plans | LiShihhsing",
      label: "Plans",
      heading: "Public Roadmap",
      description: "A public board for near-term plans, annual goals, work in progress, and completed items.",
      logicLabel: "Roadmap Logic",
      logic: [
        {
          title: "Now",
          body: "Only list work that is actually in progress."
        },
        {
          title: "Next",
          body: "Keep near-term priorities visible without overloading the page."
        },
        {
          title: "Done",
          body: "Preserve completed items as a public progress trail."
        }
      ]
    }
  }
} as const;
