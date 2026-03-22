# Student Audit Integrity - Progress Calculation Documentation

## Overview

This document describes the student progress calculation methodology used in the CCA LMS system, ensuring data integrity and accuracy when programme content changes.

## Progress Calculation Formula

### Course Progress
```
Course Progress (%) = (Completed Lessons / Total Lessons) × 100
```

**Key Points:**
- A lesson is considered "completed" when `LessonProgress.completed = true`
- Progress is stored as a float (0-100) in `CourseEnrollment.progress`
- Progress is recalculated every time a student marks a lesson as complete
- Progress is recalculated every time programme content changes (lessons added/deleted)

### Enrollment Status
- `ACTIVE`: Progress < 100%
- `COMPLETED`: Progress = 100%
- `DROPPED`: Manually set by admin/student (not automatically changed)

### Edge Cases Handled
1. **Course with no lessons**: Progress = 0%
2. **Student completes lesson, then lesson deleted**: Progress recalculated based on remaining lessons
3. **New lesson added to course**: All student progress recalculated (prevents inflated percentages)
4. **Module deleted with lessons**: All student progress recalculated
5. **Concurrent progress updates**: Handled with database transactions

## Data Integrity Features

### 1. Automatic Recalculation Triggers

Progress is automatically recalculated when:
- **Lesson Created** (`POST /api/admin/lessons`) - Recalculates all enrollments in affected course
- **Lesson Deleted** (`DELETE /api/admin/lessons/[id]`) - Recalculates all enrollments in affected course
- **Module Deleted** (`DELETE /api/admin/modules/[id]`) - Recalculates all enrollments in affected course
- **Student Progress Update** (`POST /api/student/lessons/[id]/progress`) - Recalculates enrollment for that student

### 2. Manual Recalculation API

Administrators can manually trigger progress recalculation:

**Endpoint:** `POST /api/admin/progress/recalculate`

**Scopes:**

1. **All Courses**
   ```json
   {
     "scope": "all"
   }
   ```
   Response:
   ```json
   {
     "totalCourses": 10,
     "totalEnrollments": 150,
     "updated": 148,
     "failed": 2,
     "courseResults": [...]
   }
   ```

2. **Specific Course**
   ```json
   {
     "scope": "course",
     "courseId": "clxxx..."
   }
   ```
   Response:
   ```json
   {
     "courseId": "clxxx...",
     "totalEnrollments": 25,
     "updated": 25,
     "failed": 0,
     "errors": []
   }
   ```

3. **Specific Enrollment**
   ```json
   {
     "scope": "enrollment",
     "userId": "clxxx...",
     "courseId": "clxxx..."
   }
   ```
   Response:
   ```json
   {
     "userId": "clxxx...",
     "courseId": "clxxx...",
     "progress": 75.5,
     "status": "ACTIVE"
   }
   ```

### 3. Progress Validation API

Administrators can validate progress integrity without modifying data:

**Endpoint:** `GET /api/admin/progress/validate?userId=xxx&courseId=xxx`

Response:
```json
{
  "valid": false,
  "storedProgress": 100,
  "calculatedProgress": 66.67,
  "difference": 33.33
}
```

This is useful for:
- Auditing data integrity
- Identifying discrepancies before recalculation
- Testing the system after updates

## Transaction Safety

All progress updates use database transactions to ensure:
- **Atomicity**: All updates succeed or all fail (no partial updates)
- **Consistency**: Progress always matches lesson completion state
- **Isolation**: Concurrent updates don't interfere with each other
- **Durability**: Once committed, data persists

### Example Transaction Flow
```typescript
await prisma.$transaction(async (tx) => {
  // 1. Update lesson progress
  await tx.lessonProgress.upsert(...);

  // 2. Get all lessons in course
  const allLessons = await tx.lesson.findMany(...);

  // 3. Get all completed lessons
  const completedLessons = await tx.lessonProgress.findMany(...);

  // 4. Calculate new progress
  const progress = (completed / total) * 100;

  // 5. Update enrollment with new progress
  await tx.courseEnrollment.update(...);
});
```

## Audit Trail

All progress-related events are logged in the `AuditLog` table:

- `LESSON_COMPLETED` - When a student completes a lesson
- `LESSON_PROGRESS_UPDATED` - When a student updates progress (e.g., watch time)
- `LESSON_CREATED` - When admin/lecturer adds a lesson
- `LESSON_DELETED` - When admin/lecturer deletes a lesson

This provides:
- Full history of student activity
- Ability to track when progress changed
- Compliance with educational record-keeping requirements

## Database Schema

### Core Tables

**CourseEnrollment**
```prisma
model CourseEnrollment {
  id             String            @id @default(cuid())
  userId         String
  courseId       String
  status         EnrollmentStatus  @default(ACTIVE)  // ACTIVE, COMPLETED, DROPPED
  progress       Float             @default(0)        // 0-100 percentage
  enrolledAt     DateTime          @default(now())
  completedAt    DateTime?                           // Set when progress = 100%
  lastAccessedAt DateTime?                           // Updated on each lesson access

  @@unique([userId, courseId])
  @@index([userId])
  @@index([courseId])
}
```

**LessonProgress**
```prisma
model LessonProgress {
  id             String   @id @default(cuid())
  userId         String
  lessonId       String
  completed      Boolean  @default(false)  // Binary: true = completed, false = not completed
  watchedSeconds Int      @default(0)       // For video lessons
  lastAccessedAt DateTime @default(now())

  @@unique([userId, lessonId])
  @@index([userId])
  @@index([lessonId])
}
```

## Best Practices Implemented

### 1. **Separation of Concerns**
- Progress calculation logic centralized in `lib/progress.ts`
- API endpoints delegate to utility functions
- Easy to test, maintain, and modify

### 2. **Idempotency**
- Recalculation can be run multiple times without side effects
- Always calculates from current state, not incremental updates

### 3. **Background Processing**
- Content change recalculations run asynchronously
- Don't slow down lesson creation/deletion APIs
- Errors logged but don't fail the main operation

### 4. **Comprehensive Error Handling**
- Validates input data
- Handles missing courses/enrollments gracefully
- Returns detailed error messages for debugging

### 5. **Performance Optimization**
- Batch processing for multiple enrollments
- Indexed database queries
- Parallel file deletion operations

### 6. **Data Validation**
- Validates enrollment exists before updating
- Checks course exists before recalculation
- Validates lesson belongs to correct course

## API Usage Examples

### For Students
Students interact with progress through the lesson viewer:
```typescript
// Mark lesson as completed
POST /api/student/lessons/[lessonId]/progress
{
  "completed": true
}

// Update watch time
POST /api/student/lessons/[lessonId]/progress
{
  "watchedSeconds": 300
}
```

### For Administrators

**Check if progress needs recalculation:**
```bash
curl -X GET "/api/admin/progress/validate?userId=USER_ID&courseId=COURSE_ID"
```

**Recalculate all courses (after system upgrade):**
```bash
curl -X POST "/api/admin/progress/recalculate" \
  -H "Content-Type: application/json" \
  -d '{"scope": "all"}'
```

**Recalculate specific course (after content update):**
```bash
curl -X POST "/api/admin/progress/recalculate" \
  -H "Content-Type: application/json" \
  -d '{"scope": "course", "courseId": "COURSE_ID"}'
```

## Testing & Verification

### Manual Testing Checklist

1. **Create a course with 3 lessons**
   - Verify progress = 0% for enrolled student

2. **Student completes 1 lesson**
   - Verify progress = 33.33%

3. **Add a 4th lesson to the course**
   - Verify progress recalculates to 25% (1/4)

4. **Delete 1 lesson from the course**
   - Verify progress recalculates to 33.33% (1/3)

5. **Student completes remaining lessons**
   - Verify progress = 100%
   - Verify status changes to COMPLETED
   - Verify completedAt is set

6. **Add another lesson after course completion**
   - Verify progress recalculates to ~66.67%
   - Verify status changes back to ACTIVE
   - Verify completedAt is cleared

### Automated Validation

Run the validation endpoint on all enrollments:
```bash
# Get all enrollments
GET /api/admin/student-audit

# For each enrollment, validate:
GET /api/admin/progress/validate?userId=X&courseId=Y

# If any show valid=false, recalculate:
POST /api/admin/progress/recalculate
{
  "scope": "enrollment",
  "userId": "X",
  "courseId": "Y"
}
```

## Maintenance & Monitoring

### Regular Health Checks

1. **Weekly**: Run validation on random sample of enrollments
2. **Monthly**: Full validation of all enrollments
3. **After major content updates**: Recalculate affected courses
4. **After system upgrades**: Recalculate all courses

### Monitoring Queries

**Find enrollments with suspicious progress:**
```sql
SELECT
  ce.userId,
  ce.courseId,
  ce.progress,
  COUNT(lp.id) as completedLessons,
  (
    SELECT COUNT(*)
    FROM "Lesson" l
    JOIN "Module" m ON l.moduleId = m.id
    WHERE m.courseId = ce.courseId
  ) as totalLessons
FROM "CourseEnrollment" ce
LEFT JOIN "LessonProgress" lp ON lp.userId = ce.userId
  AND lp.completed = true
  AND lp.lessonId IN (
    SELECT l.id
    FROM "Lesson" l
    JOIN "Module" m ON l.moduleId = m.id
    WHERE m.courseId = ce.courseId
  )
GROUP BY ce.userId, ce.courseId, ce.progress
HAVING ce.progress != (
  CASE
    WHEN COUNT(DISTINCT l.id) = 0 THEN 0
    ELSE (COUNT(lp.id) * 100.0 / (
      SELECT COUNT(*)
      FROM "Lesson" l
      JOIN "Module" m ON l.moduleId = m.id
      WHERE m.courseId = ce.courseId
    ))
  END
);
```

## Future Enhancements

Potential improvements for consideration:

1. **Weighted Progress**: Different lessons could have different weights
2. **Quiz/Assignment Integration**: Include quiz scores in overall progress
3. **Time-based Progress**: Consider watch time for video lessons
4. **Completion Criteria**: Require minimum score on assessments
5. **Progress Checkpoints**: Save progress snapshots for historical analysis
6. **Bulk Operations**: Admin UI for mass recalculation
7. **Progress Notifications**: Alert students when progress changes unexpectedly

## Conclusion

The student audit integrity system ensures:
- ✅ Progress percentages are always accurate
- ✅ Content changes trigger automatic recalculation
- ✅ Administrators can validate and fix discrepancies
- ✅ All updates use transactions for data consistency
- ✅ Comprehensive audit trail for compliance
- ✅ Production-ready with proper error handling
- ✅ Follows industry best practices

This implementation provides a robust, maintainable, and scalable solution for tracking student progress in the LMS.
