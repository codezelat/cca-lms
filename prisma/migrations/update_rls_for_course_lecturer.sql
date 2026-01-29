-- ============================================================================
-- Update RLS Policies to use CourseLecturer instead of lecturerId
-- ============================================================================
-- This script updates all RLS policies that reference the lecturerId column
-- to use the CourseLecturer join table instead
-- ============================================================================

-- ============================================================================
-- COURSE POLICIES - Update to use CourseLecturer
-- ============================================================================

DROP POLICY IF EXISTS "course_view_own" ON "Course";
DROP POLICY IF EXISTS "course_manage_own" ON "Course";

CREATE POLICY "course_view_own" ON "Course" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "CourseLecturer"
      WHERE "courseId" = "Course".id
      AND "lecturerId" = current_user_id()
    )
    OR current_user_role() = 'ADMIN'
  );

CREATE POLICY "course_manage_own" ON "Course" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "CourseLecturer"
      WHERE "courseId" = "Course".id
      AND "lecturerId" = current_user_id()
    )
    OR current_user_role() = 'ADMIN'
  );

-- ============================================================================
-- MODULE POLICIES - Update to use CourseLecturer
-- ============================================================================

DROP POLICY IF EXISTS "module_view" ON "Module";
DROP POLICY IF EXISTS "module_manage" ON "Module";

CREATE POLICY "module_view" ON "Module" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Course" c
      WHERE c.id = "Module"."courseId"
      AND (
        c.status = 'PUBLISHED'
        OR EXISTS (
          SELECT 1 FROM "CourseLecturer"
          WHERE "courseId" = c.id
          AND "lecturerId" = current_user_id()
        )
        OR current_user_role() = 'ADMIN'
        OR EXISTS (
          SELECT 1 FROM "CourseEnrollment"
          WHERE "courseId" = c.id AND "userId" = current_user_id()
        )
      )
    )
  );

CREATE POLICY "module_manage" ON "Module" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "Course" c
      WHERE c.id = "Module"."courseId"
      AND (
        EXISTS (
          SELECT 1 FROM "CourseLecturer"
          WHERE "courseId" = c.id
          AND "lecturerId" = current_user_id()
        )
        OR current_user_role() = 'ADMIN'
      )
    )
  );

-- ============================================================================
-- LESSON POLICIES - Update to use CourseLecturer
-- ============================================================================

DROP POLICY IF EXISTS "lesson_view" ON "Lesson";
DROP POLICY IF EXISTS "lesson_manage" ON "Lesson";

CREATE POLICY "lesson_view" ON "Lesson" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Module" m
      INNER JOIN "Course" c ON c.id = m."courseId"
      WHERE m.id = "Lesson"."moduleId"
      AND (
        ("Lesson"."isPublished" = true AND c.status = 'PUBLISHED')
        OR EXISTS (
          SELECT 1 FROM "CourseLecturer"
          WHERE "courseId" = c.id
          AND "lecturerId" = current_user_id()
        )
        OR current_user_role() = 'ADMIN'
        OR EXISTS (
          SELECT 1 FROM "CourseEnrollment"
          WHERE "courseId" = c.id AND "userId" = current_user_id()
        )
      )
    )
  );

CREATE POLICY "lesson_manage" ON "Lesson" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "Module" m
      INNER JOIN "Course" c ON c.id = m."courseId"
      WHERE m.id = "Lesson"."moduleId"
      AND (
        EXISTS (
          SELECT 1 FROM "CourseLecturer"
          WHERE "courseId" = c.id
          AND "lecturerId" = current_user_id()
        )
        OR current_user_role() = 'ADMIN'
      )
    )
  );

-- ============================================================================
-- LESSON RESOURCE POLICIES - Update to use CourseLecturer
-- ============================================================================

DROP POLICY IF EXISTS "resource_view" ON "LessonResource";
DROP POLICY IF EXISTS "resource_manage" ON "LessonResource";

CREATE POLICY "resource_view" ON "LessonResource" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Lesson" l
      INNER JOIN "Module" m ON m.id = l."moduleId"
      INNER JOIN "Course" c ON c.id = m."courseId"
      WHERE l.id = "LessonResource"."lessonId"
      AND (
        (l."isPublished" = true AND c.status = 'PUBLISHED')
        OR EXISTS (
          SELECT 1 FROM "CourseLecturer"
          WHERE "courseId" = c.id
          AND "lecturerId" = current_user_id()
        )
        OR current_user_role() = 'ADMIN'
        OR EXISTS (
          SELECT 1 FROM "CourseEnrollment"
          WHERE "courseId" = c.id AND "userId" = current_user_id()
        )
      )
    )
  );

CREATE POLICY "resource_manage" ON "LessonResource" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "Lesson" l
      INNER JOIN "Module" m ON m.id = l."moduleId"
      INNER JOIN "Course" c ON c.id = m."courseId"
      WHERE l.id = "LessonResource"."lessonId"
      AND (
        EXISTS (
          SELECT 1 FROM "CourseLecturer"
          WHERE "courseId" = c.id
          AND "lecturerId" = current_user_id()
        )
        OR current_user_role() = 'ADMIN'
      )
    )
  );

-- ============================================================================
-- RESOURCE VERSION POLICIES - Update to use CourseLecturer
-- ============================================================================

DROP POLICY IF EXISTS "resource_version_view" ON "ResourceVersion";
DROP POLICY IF EXISTS "resource_version_manage" ON "ResourceVersion";

CREATE POLICY "resource_version_view" ON "ResourceVersion" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "LessonResource" lr
      INNER JOIN "Lesson" l ON l.id = lr."lessonId"
      INNER JOIN "Module" m ON m.id = l."moduleId"
      INNER JOIN "Course" c ON c.id = m."courseId"
      WHERE lr.id = "ResourceVersion"."resourceId"
      AND (
        (l."isPublished" = true AND c.status = 'PUBLISHED')
        OR EXISTS (
          SELECT 1 FROM "CourseLecturer"
          WHERE "courseId" = c.id
          AND "lecturerId" = current_user_id()
        )
        OR current_user_role() = 'ADMIN'
        OR EXISTS (
          SELECT 1 FROM "CourseEnrollment"
          WHERE "courseId" = c.id AND "userId" = current_user_id()
        )
      )
    )
  );

CREATE POLICY "resource_version_manage" ON "ResourceVersion" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "LessonResource" lr
      INNER JOIN "Lesson" l ON l.id = lr."lessonId"
      INNER JOIN "Module" m ON m.id = l."moduleId"
      INNER JOIN "Course" c ON c.id = m."courseId"
      WHERE lr.id = "ResourceVersion"."resourceId"
      AND (
        EXISTS (
          SELECT 1 FROM "CourseLecturer"
          WHERE "courseId" = c.id
          AND "lecturerId" = current_user_id()
        )
        OR current_user_role() = 'ADMIN'
      )
    )
  );

-- ============================================================================
-- QUIZ POLICIES - Update to use CourseLecturer
-- ============================================================================

DROP POLICY IF EXISTS "quiz_view" ON "Quiz";
DROP POLICY IF EXISTS "quiz_manage" ON "Quiz";

CREATE POLICY "quiz_view" ON "Quiz" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Lesson" l
      INNER JOIN "Module" m ON m.id = l."moduleId"
      INNER JOIN "Course" c ON c.id = m."courseId"
      WHERE l.id = "Quiz"."lessonId"
      AND (
        (l."isPublished" = true AND c.status = 'PUBLISHED')
        OR EXISTS (
          SELECT 1 FROM "CourseLecturer"
          WHERE "courseId" = c.id
          AND "lecturerId" = current_user_id()
        )
        OR current_user_role() = 'ADMIN'
        OR EXISTS (
          SELECT 1 FROM "CourseEnrollment"
          WHERE "courseId" = c.id AND "userId" = current_user_id()
        )
      )
    )
  );

CREATE POLICY "quiz_manage" ON "Quiz" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "Lesson" l
      INNER JOIN "Module" m ON m.id = l."moduleId"
      INNER JOIN "Course" c ON c.id = m."courseId"
      WHERE l.id = "Quiz"."lessonId"
      AND (
        EXISTS (
          SELECT 1 FROM "CourseLecturer"
          WHERE "courseId" = c.id
          AND "lecturerId" = current_user_id()
        )
        OR current_user_role() = 'ADMIN'
      )
    )
  );

-- ============================================================================
-- QUIZ QUESTION POLICIES - Update to use CourseLecturer
-- ============================================================================

DROP POLICY IF EXISTS "quiz_question_view" ON "QuizQuestion";
DROP POLICY IF EXISTS "quiz_question_manage" ON "QuizQuestion";

CREATE POLICY "quiz_question_view" ON "QuizQuestion" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Quiz" q
      INNER JOIN "Lesson" l ON l.id = q."lessonId"
      INNER JOIN "Module" m ON m.id = l."moduleId"
      INNER JOIN "Course" c ON c.id = m."courseId"
      WHERE q.id = "QuizQuestion"."quizId"
      AND (
        (l."isPublished" = true AND c.status = 'PUBLISHED')
        OR EXISTS (
          SELECT 1 FROM "CourseLecturer"
          WHERE "courseId" = c.id
          AND "lecturerId" = current_user_id()
        )
        OR current_user_role() = 'ADMIN'
        OR EXISTS (
          SELECT 1 FROM "CourseEnrollment"
          WHERE "courseId" = c.id AND "userId" = current_user_id()
        )
      )
    )
  );

CREATE POLICY "quiz_question_manage" ON "QuizQuestion" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "Quiz" q
      INNER JOIN "Lesson" l ON l.id = q."lessonId"
      INNER JOIN "Module" m ON m.id = l."moduleId"
      INNER JOIN "Course" c ON c.id = m."courseId"
      WHERE q.id = "QuizQuestion"."quizId"
      AND (
        EXISTS (
          SELECT 1 FROM "CourseLecturer"
          WHERE "courseId" = c.id
          AND "lecturerId" = current_user_id()
        )
        OR current_user_role() = 'ADMIN'
      )
    )
  );

-- ============================================================================
-- QUIZ ANSWER POLICIES - Update to use CourseLecturer
-- ============================================================================

DROP POLICY IF EXISTS "quiz_answer_view" ON "QuizAnswer";
DROP POLICY IF EXISTS "quiz_answer_manage" ON "QuizAnswer";

CREATE POLICY "quiz_answer_view" ON "QuizAnswer" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "QuizQuestion" qq
      INNER JOIN "Quiz" q ON q.id = qq."quizId"
      INNER JOIN "Lesson" l ON l.id = q."lessonId"
      INNER JOIN "Module" m ON m.id = l."moduleId"
      INNER JOIN "Course" c ON c.id = m."courseId"
      WHERE qq.id = "QuizAnswer"."questionId"
      AND (
        (l."isPublished" = true AND c.status = 'PUBLISHED')
        OR EXISTS (
          SELECT 1 FROM "CourseLecturer"
          WHERE "courseId" = c.id
          AND "lecturerId" = current_user_id()
        )
        OR current_user_role() = 'ADMIN'
        OR EXISTS (
          SELECT 1 FROM "CourseEnrollment"
          WHERE "courseId" = c.id AND "userId" = current_user_id()
        )
      )
    )
  );

CREATE POLICY "quiz_answer_manage" ON "QuizAnswer" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "QuizQuestion" qq
      INNER JOIN "Quiz" q ON q.id = qq."quizId"
      INNER JOIN "Lesson" l ON l.id = q."lessonId"
      INNER JOIN "Module" m ON m.id = l."moduleId"
      INNER JOIN "Course" c ON c.id = m."courseId"
      WHERE qq.id = "QuizAnswer"."questionId"
      AND (
        EXISTS (
          SELECT 1 FROM "CourseLecturer"
          WHERE "courseId" = c.id
          AND "lecturerId" = current_user_id()
        )
        OR current_user_role() = 'ADMIN'
      )
    )
  );

-- ============================================================================
-- QUIZ ATTEMPT POLICIES - Update to use CourseLecturer
-- ============================================================================

DROP POLICY IF EXISTS "quiz_attempt_view_course" ON "QuizAttempt";
DROP POLICY IF EXISTS "quiz_attempt_manage_lecturer" ON "QuizAttempt";

CREATE POLICY "quiz_attempt_view_course" ON "QuizAttempt" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Quiz" q
      INNER JOIN "Lesson" l ON l.id = q."lessonId"
      INNER JOIN "Module" m ON m.id = l."moduleId"
      INNER JOIN "Course" c ON c.id = m."courseId"
      WHERE q.id = "QuizAttempt"."quizId"
      AND (
        EXISTS (
          SELECT 1 FROM "CourseLecturer"
          WHERE "courseId" = c.id
          AND "lecturerId" = current_user_id()
        )
        OR current_user_role() = 'ADMIN'
      )
    )
  );

CREATE POLICY "quiz_attempt_manage_lecturer" ON "QuizAttempt" FOR UPDATE
  USING (
    "userId" = current_user_id()
    OR EXISTS (
      SELECT 1 FROM "Quiz" q
      INNER JOIN "Lesson" l ON l.id = q."lessonId"
      INNER JOIN "Module" m ON m.id = l."moduleId"
      INNER JOIN "Course" c ON c.id = m."courseId"
      WHERE q.id = "QuizAttempt"."quizId"
      AND (
        EXISTS (
          SELECT 1 FROM "CourseLecturer"
          WHERE "courseId" = c.id
          AND "lecturerId" = current_user_id()
        )
        OR current_user_role() = 'ADMIN'
      )
    )
  );

-- ============================================================================
-- QUIZ RESPONSE POLICIES - Update to use CourseLecturer
-- ============================================================================

DROP POLICY IF EXISTS "quiz_response_view_lecturer" ON "QuizResponse";
DROP POLICY IF EXISTS "quiz_response_manage_lecturer" ON "QuizResponse";

CREATE POLICY "quiz_response_view_lecturer" ON "QuizResponse" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "QuizAttempt" qa
      INNER JOIN "Quiz" q ON q.id = qa."quizId"
      INNER JOIN "Lesson" l ON l.id = q."lessonId"
      INNER JOIN "Module" m ON m.id = l."moduleId"
      INNER JOIN "Course" c ON c.id = m."courseId"
      WHERE qa.id = "QuizResponse"."attemptId"
      AND (
        EXISTS (
          SELECT 1 FROM "CourseLecturer"
          WHERE "courseId" = c.id
          AND "lecturerId" = current_user_id()
        )
        OR current_user_role() = 'ADMIN'
      )
    )
  );

CREATE POLICY "quiz_response_manage_lecturer" ON "QuizResponse" FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "QuizAttempt" qa
      INNER JOIN "Quiz" q ON q.id = qa."quizId"
      INNER JOIN "Lesson" l ON l.id = q."lessonId"
      INNER JOIN "Module" m ON m.id = l."moduleId"
      INNER JOIN "Course" c ON c.id = m."courseId"
      WHERE qa.id = "QuizResponse"."attemptId"
      AND (
        EXISTS (
          SELECT 1 FROM "CourseLecturer"
          WHERE "courseId" = c.id
          AND "lecturerId" = current_user_id()
        )
        OR current_user_role() = 'ADMIN'
      )
    )
  );

-- ============================================================================
-- COURSE ENROLLMENT POLICIES - Update to use CourseLecturer
-- ============================================================================

DROP POLICY IF EXISTS "enrollment_view_course" ON "CourseEnrollment";
DROP POLICY IF EXISTS "enrollment_manage_course" ON "CourseEnrollment";

CREATE POLICY "enrollment_view_course" ON "CourseEnrollment" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Course" c
      WHERE c.id = "CourseEnrollment"."courseId"
      AND (
        EXISTS (
          SELECT 1 FROM "CourseLecturer"
          WHERE "courseId" = c.id
          AND "lecturerId" = current_user_id()
        )
        OR current_user_role() = 'ADMIN'
      )
    )
  );

CREATE POLICY "enrollment_manage_course" ON "CourseEnrollment" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "Course" c
      WHERE c.id = "CourseEnrollment"."courseId"
      AND (
        EXISTS (
          SELECT 1 FROM "CourseLecturer"
          WHERE "courseId" = c.id
          AND "lecturerId" = current_user_id()
        )
        OR current_user_role() = 'ADMIN'
      )
    )
  );

-- ============================================================================
-- LESSON PROGRESS POLICIES - Update to use CourseLecturer
-- ============================================================================

DROP POLICY IF EXISTS "progress_view_course" ON "LessonProgress";

CREATE POLICY "progress_view_course" ON "LessonProgress" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Lesson" l
      INNER JOIN "Module" m ON m.id = l."moduleId"
      INNER JOIN "Course" c ON c.id = m."courseId"
      WHERE l.id = "LessonProgress"."lessonId"
      AND (
        EXISTS (
          SELECT 1 FROM "CourseLecturer"
          WHERE "courseId" = c.id
          AND "lecturerId" = current_user_id()
        )
        OR current_user_role() = 'ADMIN'
      )
    )
  );

-- ============================================================================
-- SUBMISSION POLICIES - Update to use CourseLecturer
-- ============================================================================

DROP POLICY IF EXISTS "submission_view_course" ON "Submission";
DROP POLICY IF EXISTS "submission_manage_lecturer" ON "Submission";

CREATE POLICY "submission_view_course" ON "Submission" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Lesson" l
      INNER JOIN "Module" m ON m.id = l."moduleId"
      INNER JOIN "Course" c ON c.id = m."courseId"
      WHERE l.id = "Submission"."lessonId"
      AND (
        EXISTS (
          SELECT 1 FROM "CourseLecturer"
          WHERE "courseId" = c.id
          AND "lecturerId" = current_user_id()
        )
        OR current_user_role() = 'ADMIN'
      )
    )
  );

CREATE POLICY "submission_manage_lecturer" ON "Submission" FOR UPDATE
  USING (
    "userId" = current_user_id()
    OR EXISTS (
      SELECT 1 FROM "Lesson" l
      INNER JOIN "Module" m ON m.id = l."moduleId"
      INNER JOIN "Course" c ON c.id = m."courseId"
      WHERE l.id = "Submission"."lessonId"
      AND (
        EXISTS (
          SELECT 1 FROM "CourseLecturer"
          WHERE "courseId" = c.id
          AND "lecturerId" = current_user_id()
        )
        OR current_user_role() = 'ADMIN'
      )
    )
  );

-- ============================================================================
-- SUBMISSION ATTACHMENT POLICIES - Update to use CourseLecturer
-- ============================================================================

DROP POLICY IF EXISTS "attachment_view" ON "SubmissionAttachment";

CREATE POLICY "attachment_view" ON "SubmissionAttachment" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Submission" s
      WHERE s.id = "SubmissionAttachment"."submissionId"
      AND (
        s."userId" = current_user_id()
        OR EXISTS (
          SELECT 1 FROM "Lesson" l
          INNER JOIN "Module" m ON m.id = l."moduleId"
          INNER JOIN "Course" c ON c.id = m."courseId"
          WHERE l.id = s."lessonId"
          AND (
            EXISTS (
              SELECT 1 FROM "CourseLecturer"
              WHERE "courseId" = c.id
              AND "lecturerId" = current_user_id()
            )
            OR current_user_role() = 'ADMIN'
          )
        )
      )
    )
  );

-- ============================================================================
-- DONE
-- ============================================================================
