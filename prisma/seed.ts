import "dotenv/config";
// @ts-expect-error pg library lacks type definitions
import { Pool } from "pg";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { readFileSync } from "fs";
import { join } from "path";

// Create Prisma client with direct connection for seeding
const seedPrisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString:
      process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL,
  }),
});

// Create a direct PostgreSQL connection for RLS setup
const pool = new Pool({
  connectionString: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL,
});

async function enableRLS() {
  console.log("🔒 Enabling Row-Level Security...");

  try {
    const rlsSQL = readFileSync(
      join(__dirname, "migrations", "enable_rls.sql"),
      "utf-8",
    );

    await pool.query(rlsSQL);
    console.log("✅ RLS enabled successfully!");
  } catch (error) {
    console.error("❌ Error enabling RLS:", error);
    throw error;
  }
}

async function main() {
  console.log("🌱 Seeding database...");

  // Create admin user
  const adminPassword = await bcrypt.hash("Admin@123", 10);
  const admin = await seedPrisma.user.upsert({
    where: { email: "admin@codezela.com" },
    update: { password: adminPassword }, // Update password on re-seed
    create: {
      email: "admin@codezela.com",
      name: "Admin User",
      password: adminPassword,
      role: "ADMIN",
      status: "ACTIVE",
      emailVerified: new Date(),
    },
  });
  console.log("Created admin user:", admin.email);

  // Create lecturer user
  const lecturerPassword = await bcrypt.hash("Lecturer@123", 10);
  const lecturer = await seedPrisma.user.upsert({
    where: { email: "lecturer@codezela.com" },
    update: { password: lecturerPassword }, // Update password on re-seed
    create: {
      email: "lecturer@codezela.com",
      name: "Lecturer User",
      password: lecturerPassword,
      role: "LECTURER",
      status: "ACTIVE",
      emailVerified: new Date(),
    },
  });
  console.log("Created lecturer user:", lecturer.email);

  // Create student user
  const studentPassword = await bcrypt.hash("Student@123", 10);
  const student = await seedPrisma.user.upsert({
    where: { email: "student@codezela.com" },
    update: { password: studentPassword }, // Update password on re-seed
    create: {
      email: "student@codezela.com",
      name: "Student User",
      password: studentPassword,
      role: "STUDENT",
      status: "ACTIVE",
      emailVerified: new Date(),
    },
  });
  console.log("Created student user:", student.email);

  // Create a sample course with the specific ID
  const course = await seedPrisma.course.upsert({
    where: { id: "cmks5wzpk0000w9o5u4mubp2y" },
    update: {},
    create: {
      id: "cmks5wzpk0000w9o5u4mubp2y",
      title: "Introduction to Web Development",
      description:
        "Learn the fundamentals of web development with HTML, CSS, and JavaScript. This comprehensive course covers everything from basic syntax to building interactive web applications.",
      status: "PUBLISHED",
      lecturerId: lecturer.id,
    },
  });
  console.log("Created course:", course.title);

  // Create modules
  const module1 = await seedPrisma.module.create({
    data: {
      title: "Getting Started with HTML",
      description: "Learn the basics of HTML and semantic markup",
      order: 1,
      courseId: course.id,
    },
  });

  const module2 = await seedPrisma.module.create({
    data: {
      title: "Styling with CSS",
      description: "Master CSS styling and layout techniques",
      order: 2,
      courseId: course.id,
    },
  });

  const module3 = await seedPrisma.module.create({
    data: {
      title: "JavaScript Fundamentals",
      description: "Learn JavaScript programming basics",
      order: 3,
      courseId: course.id,
    },
  });

  console.log("Created modules");

  // Create lessons for module 1
  const lesson1_1 = await seedPrisma.lesson.create({
    data: {
      title: "Introduction to HTML",
      description: "Understanding HTML structure and basic tags",
      type: "VIDEO",
      duration: 900, // 15 minutes
      videoUrl: "https://www.youtube.com/embed/UB1O30fR-EE",
      order: 1,
      isPublished: true,
      moduleId: module1.id,
    },
  });

  const lesson1_2 = await seedPrisma.lesson.create({
    data: {
      title: "HTML Elements and Attributes",
      description: "Working with common HTML elements",
      type: "VIDEO",
      duration: 720, // 12 minutes
      videoUrl: "https://www.youtube.com/embed/ok-plXXHlWw",
      order: 2,
      isPublished: true,
      moduleId: module1.id,
    },
  });

  // Create lessons for module 2
  const lesson2_1 = await seedPrisma.lesson.create({
    data: {
      title: "CSS Basics",
      description: "Introduction to CSS selectors and properties",
      type: "VIDEO",
      duration: 1080, // 18 minutes
      videoUrl: "https://www.youtube.com/embed/1Rs2ND1ryYc",
      order: 1,
      isPublished: true,
      moduleId: module2.id,
    },
  });

  const lesson2_2 = await seedPrisma.lesson.create({
    data: {
      title: "CSS Flexbox",
      description: "Mastering flexbox layout",
      type: "VIDEO",
      duration: 960, // 16 minutes
      videoUrl: "https://www.youtube.com/embed/fYq5PXgSsbE",
      order: 2,
      isPublished: true,
      moduleId: module2.id,
    },
  });

  // Create lessons for module 3
  const lesson3_1 = await seedPrisma.lesson.create({
    data: {
      title: "JavaScript Variables and Data Types",
      description: "Understanding JavaScript basics",
      type: "VIDEO",
      duration: 840, // 14 minutes
      videoUrl: "https://www.youtube.com/embed/W6NZfCO5SIk",
      order: 1,
      isPublished: true,
      moduleId: module3.id,
    },
  });

  console.log("Created lessons");

  // Add some resources
  await seedPrisma.lessonResource.create({
    data: {
      title: "HTML Cheat Sheet",
      type: "EXTERNAL_LINK",
      externalUrl: "https://htmlcheatsheet.com/",
      lessonId: lesson1_1.id,
    },
  });

  await seedPrisma.lessonResource.create({
    data: {
      title: "CSS Reference Guide",
      type: "EXTERNAL_LINK",
      externalUrl: "https://cssreference.io/",
      lessonId: lesson2_1.id,
    },
  });

  await seedPrisma.lessonResource.create({
    data: {
      title: "JavaScript Documentation",
      type: "EXTERNAL_LINK",
      externalUrl: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
      lessonId: lesson3_1.id,
    },
  });

  console.log("Created resources");

  // Enroll student in the course
  await seedPrisma.courseEnrollment.upsert({
    where: {
      userId_courseId: {
        userId: student.id,
        courseId: course.id,
      },
    },
    update: {},
    create: {
      userId: student.id,
      courseId: course.id,
      status: "ACTIVE",
      progress: 0,
    },
  });

  console.log("Enrolled student in course");

  console.log("✅ Seeding complete!");

  // Enable RLS after seeding
  await enableRLS();
}

main()
  .catch((e) => {
    console.error("❌ Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await seedPrisma.$disconnect();
    await pool.end();
  });
