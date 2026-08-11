# West Coast College Student Portal - UI/UX Design Specifications

## Design Philosophy

### Core Principles
- **Student-Centric**: Design focused on student needs and workflows
- **Clarity First**: Information presented clearly and hierarchically
- **Efficiency**: Minimize taps and time to complete tasks
- **Accessibility**: Inclusive design for all users
- **Consistency**: Unified experience across all screens

### Brand Alignment
- Use WCC College colors and branding elements
- Professional yet approachable aesthetic
- Clean, modern interface suitable for academic environment

## Screen Flow Diagrams

### Main User Flow

```
Splash Screen
    ↓
Login Screen
    ↓
Dashboard (Home)
    ↓
    ├── Schedule
    │   ├── Weekly View
    │   ├── Daily View
    │   └── Class Details
    ├── Grades
    │   ├── Current Semester
    │   ├── Previous Semesters
    │   └── Grade Details
    ├── Announcements
    │   ├── List View
    │   ├── Detail View
    │   └── Filter View
    ├── Documents
    │   ├── Available Documents
    │   └── Document Viewer
    ├── Profile
    │   ├── Personal Info
    │   ├── Contact Info
    │   └── Academic Summary
    └── Support
        ├── Contact
        ├── FAQ
        └── Issue Report
```

### Authentication Flow

```
App Launch
    ↓
Splash Screen (2-3 seconds)
    ↓
Check Auth Status
    ↓
    ├── Has Valid Token → Dashboard
    └── No Token → Login Screen
                ↓
            Enter Credentials
                ↓
            Validate & Authenticate
                ↓
            Dashboard
```

## Screen Specifications

### 1. Splash Screen

**Purpose**: Brand exposure and initial loading

**Elements**:
- WCC College logo (centered)
- App name: "WCC Student Portal"
- Loading indicator
- Brief tagline: "Your Academic Journey, One Tap Away"

**Background**: Primary color gradient (deep blue to light blue)

**Duration**: 2-3 seconds (minimum), extended if loading required

**Transitions**: Fade to login screen or dashboard

---

### 2. Login Screen

**Purpose**: Student authentication

**Layout**:
- Logo and app name (top)
- Welcome message: "Welcome Back"
- Student number input field
- Password input field with show/hide toggle
- "Forgot Password?" link
- Login button (primary)
- Biometric login button (if enabled)
- "First-time user?" link with setup instructions

**Input Fields**:
- Student Number: Numeric keypad, auto-formatting
- Password: Secure text entry, minimum 8 characters

**States**:
- Normal: All fields enabled
- Loading: Disable inputs, show spinner
- Error: Red error message below relevant field
- Success: Navigate to dashboard

**Accessibility**:
- Proper labels for screen readers
- Keyboard navigation support
- High contrast error messages

---

### 3. Dashboard (Home Screen)

**Purpose**: Quick overview of student status and key information

**Layout**:
- App bar with student name and profile picture
- Status card (Enrolled/Not Enrolled, year level, course)
- Today's schedule preview (next class)
- Recent announcements (max 3)
- Quick action buttons (View Grades, Check Schedule, etc.)
- Academic calendar highlights
- Bottom navigation bar

**Status Card**:
- Student photo (left)
- Name and student number
- Course and year level
- Enrollment status badge
- Current semester and school year

**Today's Schedule**:
- "Today's Classes" header
- Timeline view of today's classes
- Next class highlighted
- Time, subject, room, professor
- Tap to view full schedule

**Recent Announcements**:
- "Recent Announcements" header
- Card-style announcements (max 3)
- Title, preview text, time
- Urgent announcements highlighted
- Tap to view full announcement

**Quick Actions**:
- Grid of action buttons
- Icons with labels
- View Grades, Schedule, Documents, Profile

**Bottom Navigation**:
- 5 tabs: Home, Schedule, Grades, Announcements, Profile
- Active tab highlighted
- Icons with labels

---

### 4. Schedule Screen

**Purpose**: View class schedule

**Tabs**:
- Weekly View (default)
- Daily View

**Weekly View**:
- 7-day calendar grid
- Current day highlighted
- Color-coded classes by subject
- Tap day to see classes
- Filter by course/section

**Daily View**:
- Timeline layout (8AM - 8PM)
- Class cards with time blocks
- Subject, professor, room details
- Current time indicator
- Swipe between days

**Class Details** (tap on class):
- Subject code and name
- Professor name and contact
- Room number
- Time and duration
- Units
- Schedule notes
- "View Professor Contact" button

---

### 5. Grades Screen

**Purpose**: View academic performance

**Layout**:
- Semester selector (dropdown)
- GPA summary card
- Grade list by subject
- Historical semesters (expandable)

**GPA Summary**:
- Current GPA (large, prominent)
- Units completed
- Academic standing
- Semester and school year

**Grade List**:
- Subject code and name
- Grade (numeric)
- Units
- Professor
- Remarks (Passed/Failed)
- Tap for detailed breakdown

**Grade Details**:
- Subject information
- Midterm grade (if available)
- Final grade
- Grade calculation breakdown
- Professor comments
- Grade date

**Historical Semesters**:
- Accordion-style list
- Semester header with GPA
- Tap to expand/collapse
- Same grade list format

---

### 6. Announcements Screen

**Purpose**: View college and course announcements

**Layout**:
- Filter chips (All, Urgent, Academic, Events)
- Search bar
- Announcement list (cards)
- Pull-to-refresh

**Filter Chips**:
- Horizontal scrollable
- Active chip highlighted
- Filter by type and priority

**Announcement Card**:
- Type indicator (icon + color)
- Title
- Preview text (2 lines)
- Date/time
- Pin icon if pinned
- Urgent announcements highlighted

**Announcement Detail**:
- Full title
- Type and priority badges
- Full message content
- Attachments (images, documents)
- Date and author
- Share button
- Back button

---

### 7. Documents Screen

**Purpose**: View and access official documents

**Layout**:
- Document type tabs (All, COR, Transcript, Certificates)
- Document list (cards)
- Status indicators

**Document Card**:
- Document type icon
- Title and description
- Status badge (Available, Pending, Processing)
- Issue date (if available)
- Expiry date (if applicable)
- Download/View button

**Document Viewer**:
- PDF viewer integration
- Download option
- Share option
- Print option
- Document metadata

---

### 8. Profile Screen

**Purpose**: View personal and academic information

**Tabs**:
- Personal Info
- Contact Info
- Academic Summary

**Personal Info**:
- Profile photo
- Full name
- Student number
- Birth date
- Gender
- Civil status
- Nationality
- Religion

**Contact Info**:
- Email address
- Phone number
- Current address
- Permanent address
- Emergency contact details

**Academic Summary**:
- Course and major
- Year level and section
- Current semester
- Enrollment status
- Scholarship (if applicable)
- Academic standing
- GPA

---

### 9. Support Screen

**Purpose**: Get help and support

**Layout**:
- Contact information card
- FAQ section (expandable)
- Issue report form
- Campus directory

**Contact Information**:
- Registrar office hours
- Phone numbers
- Email addresses
- Location map

**FAQ Section**:
- Common questions and answers
- Search functionality
- Categories (Academic, Technical, Administrative)

**Issue Report Form**:
- Issue type selector
- Description field
- Attachment option
- Submit button

---

## Component Specifications

### Buttons

#### Primary Button
- **Background**: Primary color (#1E3A8A)
- **Text**: White
- **Height**: 48px
- **Border Radius**: 8px
- **States**: Normal, Pressed (opacity 0.8), Disabled (gray)

#### Secondary Button
- **Background**: Transparent
- **Border**: 2px primary color
- **Text**: Primary color
- **Height**: 48px
- **Border Radius**: 8px

#### Text Button
- **Background**: Transparent
- **Text**: Primary color
- **Height**: 40px
- **No border**

#### Icon Button
- **Size**: 48x48px
- **Icon Size**: 24px
- **Ripple effect**

---

### Cards

#### Status Card
- **Background**: White
- **Elevation**: 4dp
- **Border Radius**: 12px
- **Padding**: 16px
- **Shadow**: Subtle

#### Class Card
- **Background**: White
- **Left Border**: 4px color-coded by subject
- **Border Radius**: 8px
- **Padding**: 12px
- **Elevation**: 2dp

#### Announcement Card
- **Background**: White
- **Border Radius**: 8px
- **Padding**: 16px
- **Elevation**: 2dp
- **Type Icon**: Top left

---

### Input Fields

#### Text Input
- **Height**: 56px
- **Border Radius**: 8px
- **Border**: 1px gray
- **Focus Border**: 2px primary color
- **Error Border**: 2px red
- **Label**: Floating label above field

#### Dropdown
- **Height**: 56px
- **Border Radius**: 8px
- **Chevron icon** on right
- **Dialog** for selection

---

### Navigation

#### Bottom Navigation Bar
- **Height**: 56px
- **Background**: White
- **Elevation**: 8dp
- **Active Icon**: Primary color
- **Inactive Icon**: Gray
- **Labels**: 12px font

#### App Bar
- **Height**: 56px
- **Background**: Primary color
- **Title**: White, 20px
- **Icons**: White, 24px

---

## Color Palette

### Primary Colors
```dart
class AppColors {
  // Primary Brand Colors
  static const Color primary = Color(0xFF1E3A8A);      // Deep Blue
  static const Color primaryLight = Color(0xFF3B82F6);  // Light Blue
  static const Color primaryDark = Color(0xFF1E40AF);   // Darker Blue
  
  // Secondary Colors
  static const Color secondary = Color(0xFF10B981);     // Green
  static const Color accent = Color(0xFFF59E0B);       // Amber
  
  // Status Colors
  static const Color success = Color(0xFF10B981);      // Green
  static const Color warning = Color(0xFFF59E0B);      // Amber
  static const Color error = Color(0xFFEF4444);       // Red
  static const Color info = Color(0xFF3B82F6);        // Blue
  
  // Neutral Colors
  static const Color background = Color(0xFFF9FAFB);   // Light Gray
  static const Color surface = Color(0xFFFFFFFF);      // White
  static const Color surfaceVariant = Color(0xFFF3F4F6); // Medium Gray
  
  // Text Colors
  static const Color textPrimary = Color(0xFF111827);   // Almost Black
  static const Color textSecondary = Color(0xFF6B7280); // Dark Gray
  static const Color textTertiary = Color(0xFF9CA3AF);  // Medium Gray
  static const Color textDisabled = Color(0xFFD1D5DB);  // Light Gray
  
  // Divider Colors
  static const Color divider = Color(0xFFE5E7EB);      // Light Gray
  
  // Overlay Colors
  static const Color overlay = Color(0x80000000);       // Semi-transparent black
}
```

### Semantic Color Usage
- **Primary**: Main actions, navigation, active states
- **Secondary**: Success states, positive feedback
- **Accent**: Highlights, important information
- **Success**: Completed actions, available items
- **Warning**: Pending items, caution states
- **Error**: Failed actions, invalid states
- **Info**: Informational content, neutral states

---

## Typography

### Font Family
- **Primary**: Roboto (Android default)
- **iOS**: San Francisco (iOS default)
- **Fallback**: System fonts

### Type Scale
```dart
class AppTextStyles {
  // Display
  static const TextStyle displayLarge = TextStyle(
    fontSize: 57,
    fontWeight: FontWeight.w400,
    letterSpacing: -0.25,
  );
  
  static const TextStyle displayMedium = TextStyle(
    fontSize: 45,
    fontWeight: FontWeight.w400,
  );
  
  static const TextStyle displaySmall = TextStyle(
    fontSize: 36,
    fontWeight: FontWeight.w400,
  );
  
  // Headline
  static const TextStyle headlineLarge = TextStyle(
    fontSize: 32,
    fontWeight: FontWeight.w600,
  );
  
  static const TextStyle headlineMedium = TextStyle(
    fontSize: 28,
    fontWeight: FontWeight.w600,
  );
  
  static const TextStyle headlineSmall = TextStyle(
    fontSize: 24,
    fontWeight: FontWeight.w600,
  );
  
  // Title
  static const TextStyle titleLarge = TextStyle(
    fontSize: 22,
    fontWeight: FontWeight.w500,
  );
  
  static const TextStyle titleMedium = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.w500,
    letterSpacing: 0.15,
  );
  
  static const TextStyle titleSmall = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w500,
    letterSpacing: 0.1,
  );
  
  // Body
  static const TextStyle bodyLarge = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.w400,
    letterSpacing: 0.5,
  );
  
  static const TextStyle bodyMedium = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    letterSpacing: 0.25,
  );
  
  static const TextStyle bodySmall = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w400,
    letterSpacing: 0.4,
  );
  
  // Label
  static const TextStyle labelLarge = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w500,
    letterSpacing: 0.1,
  );
  
  static const TextStyle labelMedium = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    letterSpacing: 0.5,
  );
  
  static const TextStyle labelSmall = TextStyle(
    fontSize: 11,
    fontWeight: FontWeight.w500,
    letterSpacing: 0.5,
  );
}
```

### Typography Usage
- **Display Large**: Splash screen branding
- **Headline Large**: Screen titles
- **Title Medium**: Card titles, section headers
- **Body Large**: Main content text
- **Body Medium**: Secondary content
- **Label Medium**: Button text, form labels

---

## Spacing and Dimensions

### Spacing Scale
```dart
class AppSpacing {
  static const double xs = 4.0;
  static const double sm = 8.0;
  static const double md = 16.0;
  static const double lg = 24.0;
  static const double xl = 32.0;
  static const double xxl = 48.0;
}
```

### Component Dimensions
```dart
class AppDimensions {
  // Buttons
  static const double buttonHeight = 48.0;
  static const double buttonHeightSmall = 40.0;
  static const double buttonHeightLarge = 56.0;
  
  // Inputs
  static const double inputHeight = 56.0;
  
  // Navigation
  static const double bottomNavHeight = 56.0;
  static const double appBarHeight = 56.0;
  
  // Cards
  static const double cardPadding = 16.0;
  static const double cardBorderRadius = 12.0;
  
  // Icons
  static const double iconSmall = 16.0;
  static const double iconMedium = 24.0;
  static const double iconLarge = 32.0;
  
  // Avatar
  static const double avatarSmall = 32.0;
  static const double avatarMedium = 48.0;
  static const double avatarLarge = 64.0;
}
```

---

## Accessibility

### Color Contrast
- **Minimum Contrast Ratio**: 4.5:1 (WCAG AA)
- **Enhanced Contrast Ratio**: 7:1 (WCAG AAA)
- All text meets AA standards
- Interactive elements have enhanced contrast

### Touch Targets
- **Minimum Size**: 44x44dp (iOS), 48x48dp (Android)
- **Recommended Size**: 48x48dp
- All buttons and interactive elements meet minimum

### Screen Reader Support
- Semantic labels for all interactive elements
- Proper focus order
- State announcements (loading, error, success)
- Image descriptions

### Motor Accessibility
- Keyboard navigation support
- Voice control compatibility
- Gesture alternatives (buttons for swipe actions)
- Adjustable timeout durations

### Visual Accessibility
- Scalable text (support system font size)
- Color-independent information (icons + text)
- No color-only differentiation
- High contrast mode support

---

## Responsive Design

### Screen Sizes Supported
- **Small**: < 360dp width
- **Medium**: 360-600dp width
- **Large**: 600-840dp width
- **Extra Large**: > 840dp width

### Layout Adaptations
- **Small**: Single column, compact spacing
- **Medium**: Single column, standard spacing
- **Large**: Two columns where appropriate
- **Extra Large**: Tablet layout with side navigation

### Orientation Support
- **Portrait**: Primary layout
- **Landscape**: Adapted layout (horizontal scrolling)

---

## Animation and Motion

### Animation Duration
- **Fast**: 150ms (micro-interactions)
- **Medium**: 300ms (transitions)
- **Slow**: 500ms (complex animations)

### Easing Curves
- **Standard**: Curves.easeInOut
- **Enter**: Curves.easeOut
- **Exit**: Curves.easeIn

### Animation Types
- **Fade**: Screen transitions
- **Slide**: Navigation between screens
- **Scale**: Button presses
- **Shrink**: Loading states

### Reduced Motion
- Respect system reduced motion preference
- Disable animations when reduced motion is enabled
- Provide instant transitions instead

---

## Error States and Empty States

### Error States
- **Network Error**: Illustration + retry button
- **Authentication Error**: Clear error message + retry
- **Validation Error**: Inline error below field
- **Server Error**: Generic message + contact support

### Empty States
- **No Schedule**: Illustration + "No classes today"
- **No Grades**: Illustration + "No grades available yet"
- **No Announcements**: Illustration + "No announcements"
- **No Documents**: Illustration + "No documents available"

---

## Dark Mode Support

### Dark Mode Colors
```dart
class AppDarkColors {
  static const Color background = Color(0xFF121212);
  static const Color surface = Color(0xFF1E1E1E);
  static const Color surfaceVariant = Color(0xFF2C2C2C);
  static const Color textPrimary = Color(0xFFFFFFFF);
  static const Color textSecondary = Color(0xFFB0B0B0);
  static const Color divider = Color(0xFF3C3C3C);
}
```

### Dark Mode Strategy
- Respect system theme preference
- Manual toggle in settings
- Consistent contrast ratios
- Maintain brand identity in dark mode

---

## Iconography

### Icon Set
- **Primary**: Material Icons (Google)
- **Style**: Outlined style (consistent)
- **Size**: 24px (standard), 32px (large)

### Key Icons
- **Home**: home
- **Schedule**: calendar_today
- **Grades**: school
- **Announcements**: notifications
- **Profile**: person
- **Settings**: settings
- **Search**: search
- **Filter**: filter_list
- **Back**: arrow_back
- **Menu**: menu
- **Close**: close
- **Check**: check
- **Error**: error
- **Warning**: warning
- **Success**: check_circle
- **Info**: info

---

## Loading States

### Loading Indicators
- **Full Screen**: Circular progress + message
- **Button**: Circular progress (replaces text)
- **List**: Skeleton loaders
- **Pull-to-Refresh**: Circular progress at top

### Loading Messages
- "Loading your information..."
- "Fetching latest data..."
- "Please wait..."
- "Almost there..."

---

## Feedback and Confirmation

### Success Feedback
- Green checkmark animation
- Success message
- Auto-dismiss after 3 seconds

### Error Feedback
- Red error icon
- Error message
- Dismiss button
- Retry option if applicable

### Confirmation Dialogs
- Clear title and message
- "Cancel" (secondary) and "Confirm" (primary) buttons
- Destructive actions have red confirm button

---

## Internationalization

### Supported Languages
- English (primary)
- Filipino (secondary)
- Extensible for future languages

### Date/Time Formats
- Follow system locale
- Consistent formatting across app
- Relative time (e.g., "2 hours ago")

### Number Formats
- Follow system locale
- Decimal points for grades
- Phone number formatting

---

## Performance Considerations

### Image Optimization
- WebP format preferred
- Lazy loading for lists
- Placeholder colors while loading
- Caching strategy

### List Performance
- Lazy building for long lists
- Pagination for large datasets
- Efficient item rendering
- Smooth scrolling

### Memory Management
- Proper widget disposal
- Image caching limits
- Controller cleanup
- Stream cancellation