-- ============================================================================
-- ENABLE RLS ON MISSING TABLES
-- ============================================================================

ALTER TABLE "CourseLecturer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssignmentSubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssignmentSubmissionAttachment" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- COURSE LECTURER POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "course_lecturer_view" ON "CourseLecturer";
DROP POLICY IF EXISTS "course_lecturer_manage" ON "CourseLecturer";

-- View: Admins, the lecturer themselves, or if the course is published/accessible
CREATE POLICY "course_lecturer_view" ON "CourseLecturer" FOR SELECT
  USING (
    -- Admin can see all
    current_user_role() = 'ADMIN'
    -- The lecturer themselves can see their assignment
    OR "lecturerId" = current_user_id()
    -- Anyone can see lecturers for published courses
    OR EXISTS (
      SELECT 1 FROM "Course" c
      WHERE c.id = "CourseLecturer"."courseId"
      AND (
        c.status = 'PUBLISHED'
        -- Or if the user is enrolled in the course
        OR EXISTS (
          SELECT 1 FROM "CourseEnrollment"
          WHERE "courseId" = c.id AND "userId" = current_user_id()
        )
      )
    )
  );

-- Manage: Admins only (Assignment of lecturers is an admin task usually)
CREATE POLICY "course_lecturer_manage" ON "CourseLecturer" FOR ALL
  USING (
    current_user_role() = 'ADMIN'
  );

-- ============================================================================
-- ASSIGNMENT POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "assignment_view" ON "Assignment";
DROP POLICY IF EXISTS "assignment_manage" ON "Assignment";

-- View: Consistent with Lesson view policies
CREATE POLICY "assignment_view" ON "Assignment" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Lesson" l
      INNER JOIN "Module" m ON m.id = l."moduleId"
      INNER JOIN "Course" c ON c.id = m."courseId"
      WHERE l.id = "Assignment"."lessonId"
      AND (
        -- Published course/lesson
        (l."isPublished" = true AND c.status = 'PUBLISHED')
        -- Lecturer of the course
        OR EXISTS (
          SELECT 1 FROM "CourseLecturer"
          WHERE "courseId" = c.id
          AND "lecturerId" = current_user_id()
        )
        -- Admin
        OR current_user_role() = 'ADMIN'
        -- Enrolled student
        OR EXISTS (
          SELECT 1 FROM "CourseEnrollment"
          WHERE "courseId" = c.id AND "userId" = current_user_id()
        )
      )
    )
  );

-- Manage: Admins or Lecturers of the course
CREATE POLICY "assignment_manage" ON "Assignment" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "Lesson" l
      INNER JOIN "Module" m ON m.id = l."moduleId"
      INNER JOIN "Course" c ON c.id = m."courseId"
      WHERE l.id = "Assignment"."lessonId"
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
-- ASSIGNMENT SUBMISSION POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "assignment_submission_view_own" ON "AssignmentSubmission";
DROP POLICY IF EXISTS "assignment_submission_view_course" ON "AssignmentSubmission";
DROP POLICY IF EXISTS "assignment_submission_manage_own" ON "AssignmentSubmission";
DROP POLICY IF EXISTS "assignment_submission_manage_lecturer" ON "AssignmentSubmission";

-- View Own: Student sees their own submission
CREATE POLICY "assignment_submission_view_own" ON "AssignmentSubmission" FOR SELECT
  USING ("userId" = current_user_id());

-- View Course: Lecturers/Admins see submissions for their course
CREATE POLICY "assignment_submission_view_course" ON "AssignmentSubmission" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Assignment" a
      INNER JOIN "Lesson" l ON l.id = a."lessonId"
      INNER JOIN "Module" m ON m.id = l."moduleId"
      INNER JOIN "Course" c ON c.id = m."courseId"
      WHERE a.id = "AssignmentSubmission"."assignmentId"
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

-- Manage Own: Student can insert/update their own submission
CREATE POLICY "assignment_submission_manage_own" ON "AssignmentSubmission" FOR ALL
  USING ("userId" = current_user_id());

-- Manage Lecturer: Lecturers/Admins can update for grading
CREATE POLICY "assignment_submission_manage_lecturer" ON "AssignmentSubmission" FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "Assignment" a
      INNER JOIN "Lesson" l ON l.id = a."lessonId"
      INNER JOIN "Module" m ON m.id = l."moduleId"
      INNER JOIN "Course" c ON c.id = m."courseId"
      WHERE a.id = "AssignmentSubmission"."assignmentId"
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
-- ASSIGNMENT SUBMISSION ATTACHMENT POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "assignment_attachment_view" ON "AssignmentSubmissionAttachment";
DROP POLICY IF EXISTS "assignment_attachment_manage" ON "AssignmentSubmissionAttachment";

-- View: If user can view the submission, they can view the attachment
CREATE POLICY "assignment_attachment_view" ON "AssignmentSubmissionAttachment" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "AssignmentSubmission" s
      WHERE s.id = "AssignmentSubmissionAttachment"."submissionId"
      AND (
        -- Own submission
        s."userId" = current_user_id()
        -- Or user has lecturer/admin rights to the course (re-using logic via check on submission or explicit check)
        -- Note: RLS checks are row-by-row. We need to duplicate the logic or trust the user can see the parent.
        -- BUT, for security, we should re-verify properties of the parent submission's context.
        OR EXISTS (
          SELECT 1 FROM "Assignment" a
          INNER JOIN "Lesson" l ON l.id = a."lessonId"
          INNER JOIN "Module" m ON m.id = l."moduleId"
          INNER JOIN "Course" c ON c.id = m."courseId"
          WHERE a.id = s."assignmentId"
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

-- Manage: If user owns the submission, they can manage attachments
CREATE POLICY "assignment_attachment_manage" ON "AssignmentSubmissionAttachment" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "AssignmentSubmission"
      WHERE id = "AssignmentSubmissionAttachment"."submissionId"
      AND "userId" = current_user_id()
    )
  );
