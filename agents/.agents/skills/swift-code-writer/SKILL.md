---
name: swift-code-writer
description: Writes idiomatic Swift code and implementation guidance using project settings, Xcode MCP tools, and Apple documentation as source of truth.
version: 1.1.0
author: JD
category: development
---

# Skill: Swift Code Writer

## Description

Writes idiomatic Swift code and implementation guidance for Apple platforms. Use the project, Xcode MCP tools, active build settings, run destinations, and Apple documentation as the source of truth. Prefer modern Swift, SwiftUI, SwiftData, Observation, and structured concurrency when they fit the project.

## When to Use This Skill

Use this skill when:

- Writing Swift code for experienced developers
- Choosing Swift, SwiftUI, SwiftData, Observation, or concurrency patterns
- Implementing app features, models, views, view models, tests, or platform integrations
- Reviewing Swift code for correctness, maintainability, and project fit
- Code needs to work across Apple platforms supported by the project

## Instructions

### Xcode Agent Workflow

When running inside Xcode, prefer Xcode MCP tools over shell commands:

- Use `XcodeRead`, `XcodeGrep`, `XcodeGlob`, and `XcodeWrite` for project files.
- Use `GetTargetBuildSettings` before making deployment-target or build-setting assumptions.
- Use `DocumentationSearch` before using new, recently changed, or uncertain Apple APIs.
- Use `XcodeRefreshCodeIssuesInFile` for fast diagnostics after Swift edits.
- Use `BuildProject` for final compile validation.
- Use `RunSomeTests` or `RunAllTests` for test validation.
- Use `RenderPreview` when changing SwiftUI views with previews.
- Use `AddInfoPlist`, `AddEntitlement`, `UpdateTargetBuildSetting`, and related Xcode tools instead of editing project metadata directly.

Before generating code that relies on Apple APIs, use `DocumentationSearch` for APIs or patterns that may have changed, especially SwiftUI, SwiftData, Observation, Testing, FoundationModels, Liquid Glass, and platform integration APIs.

### Source of Truth

- Inspect project files and existing architecture before introducing new patterns.
- Inspect target build settings and active run destinations before making availability decisions.
- Do not assume deployment targets such as specific iOS, macOS, watchOS, tvOS, or visionOS versions.
- Follow Apple documentation for API usage, availability, deprecations, and platform behavior.
- Match existing project conventions unless the user asks for a change.

### Swift Patterns

#### Concurrency

- Prefer `async/await` for asynchronous operations.
- Use structured concurrency primitives where they fit:
  - `Task` for launching async work from synchronous contexts
  - `async let` for fixed parallel async operations
  - Task groups for dynamic parallel operations
  - Actors for isolated mutable state
- Use modern async-aware system APIs, such as `URLSession.shared.data(from:)`, when available for the target.
- Wrap callback APIs when it improves call-site clarity or error handling.
- Keep delegates where Apple APIs, UIKit/AppKit integration, representable coordinators, or existing architecture require them.
- Mark UI-facing async models as `@MainActor` when they mutate state read by SwiftUI.

#### Observation and State

- Use `@Observable` for reference-type models where Observation is appropriate.
- Choose state tools based on ownership and behavior:
  - `@State` for view-owned local state
  - `@Binding` for parent-owned mutable state
  - `@Environment` for ambient dependencies and shared values
  - `@Bindable` when a view needs bindings into an observable model
  - `@Model` for SwiftData-persisted model objects
  - Actors for concurrent mutable state outside the main actor
- Avoid using `NotificationCenter` as general app state plumbing.
- Use `NotificationCenter` for framework event observation or interoperability when that is the right API.

#### Type System

- Prefer value types by default.
- Use reference types when identity, shared mutable state, Observation, SwiftData, or framework requirements call for them.
- Model invalid states out of existence with enums, optionals, access control, and focused initializers.
- Use protocols and generics when they clarify boundaries. Avoid abstraction that does not pull its weight.

### SwiftUI Guidelines

#### Platform Design

- Design features to work idiomatically on the platforms supported by the project.
- Respect platform conventions:
  - Sidebar navigation on macOS and iPadOS when appropriate
  - Context menus where they match platform behavior
  - Platform-appropriate control sizing and input handling
- Use adaptive layouts for different screen sizes and input methods.
- Use compile-time platform checks when needed: `#if os(iOS)`, `#if os(macOS)`, and related conditions.
- Prefer native SwiftUI first.
- Use `UIViewRepresentable`, `NSViewRepresentable`, or related representables for platform APIs without SwiftUI equivalents, or when the project already uses that integration path.

#### Idiomatic SwiftUI

- Prefer semantic SwiftUI elements: `LabeledContent`, `Toggle`, `Picker`, `Slider`, `NavigationSplitView`, and related types where they fit.
- Compose views into small, reusable components.
- Use proper data flow: `@State`, `@Binding`, `@Environment`, `@Bindable`, and observable models.
- Use `NavigationStack` or `NavigationSplitView` based on the project navigation model.
- Use `.task` for async work tied to view lifecycle when appropriate.
- Avoid constant bindings for interactive state in examples and app code. Use real dismissible bindings or identifiable state.

### Persistence

- Prefer SwiftData for new local persistence when it fits the project.
- Use `@Model` for SwiftData models.
- Use `ModelContext` for persistence operations.
- Use `#Predicate` for type-safe queries.
- Define relationships and delete rules deliberately.
- Follow the project's existing persistence architecture.
- Do not migrate Core Data, file storage, SQLite, cloud storage, or other persistence systems unless the user explicitly asks.

### Package Management

- Only add Swift packages when necessary.
- Prefer Apple frameworks and official packages when they solve the problem.
- Use well-maintained community packages when they are justified by project needs.
- Confirm major package additions with the user or project requirements.

### Code Quality Standards

#### Testing

- Prefer Swift Testing for new unit and integration tests:
  - `import Testing`
  - `@Test`
  - `#expect`
  - `#require`
- Use tests for models, data layers, view models, business logic, and critical application paths.
- Cover expected behavior, edge cases, and error paths.
- Keep XCTest guidance for UI automation, legacy tests, or APIs that still require XCTest.
- Use XCUIAutomation for UI tests when needed.
- Validate with `RunSomeTests` or `RunAllTests` when Xcode MCP tools are available.

#### Error Handling

- Use Swift's `Error` protocol for domain errors.
- Handle errors with `do`/`try`/`catch` where recovery or user feedback is needed.
- Propagate errors from async APIs instead of swallowing them.
- Use `Result` when it is required by an API or improves modeling.
- Display error states clearly in SwiftUI views with dismissible state.

#### Comments

- Document purpose, logic, and rationale. Avoid comments that only restate the code.
- Explain non-obvious choices:
  - Why `@Observable` or `@MainActor` is appropriate
  - Why a specific async pattern is used
  - Complex generics or type constraints
  - Non-obvious SwiftUI modifiers or SwiftData queries
- Prefer single-line comments (`//`) over block comments.
- Use underscore (`_`) for intentionally unused parameters.

### Code Organization

#### View Complexity

- Refactor complex views into smaller reusable subviews.
- Keep view bodies focused and readable.
- Extract repeated UI patterns into custom views.

#### State Management

- For simple local state, use `@State`.
- For parent-owned mutable state, use `@Binding`.
- For shared reference state, use an observable model and inject it through the environment when appropriate.
- For persistence, follow the project's SwiftData or existing storage architecture.
- For complex navigation, use a typed route model or `NavigationPath` with `NavigationStack`, based on project conventions.

#### Readability and Maintainability

- Prioritize code clarity.
- Use Swift's declarative patterns for UI and data flow.
- Minimize imperative code in SwiftUI views.
- Keep side effects explicit and testable.

### Staying Current

Before generating code:

- Use Xcode MCP tools and Apple documentation when available.
- Verify current API behavior for SwiftUI, SwiftData, Observation, Testing, FoundationModels, Liquid Glass, and platform integration APIs.
- Check for recent framework changes or deprecations before relying on memory.
- Confirm API availability against project build settings and active run destinations.
- Suggest updating this skill or `swift-mentor` when significant patterns change.

## Examples

### Example 1: Async Data Fetching with Error Handling

```swift
@MainActor
@Observable
final class ArticleViewModel {
    var articles: [Article] = []
    var isLoading = false
    var error: ArticleError?

    func fetchArticles() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let (data, _) = try await URLSession.shared.data(from: articlesURL)
            articles = try JSONDecoder().decode([Article].self, from: data)
            error = nil
        } catch {
            self.error = ArticleError(error)
            articles = []
        }
    }
}

struct ArticleError: Identifiable {
    let id = UUID()
    let message: String

    init(_ error: Error) {
        self.message = error.localizedDescription
    }
}

struct ArticlesView: View {
    @State private var viewModel = ArticleViewModel()

    var body: some View {
        List(viewModel.articles) { article in
            ArticleRow(article: article)
        }
        .overlay {
            if viewModel.isLoading {
                ProgressView()
            }
        }
        .alert(item: $viewModel.error) { error in
            Alert(
                title: Text("Error"),
                message: Text(error.message),
                dismissButton: .default(Text("OK"))
            )
        }
        .task {
            await viewModel.fetchArticles()
        }
    }
}
```

### Example 2: SwiftData Model with Relationships

```swift
import SwiftData

@Model
final class Project {
    var name: String
    var createdAt: Date
    @Relationship(deleteRule: .cascade) var tasks: [ProjectTask]

    init(name: String, createdAt: Date = .now) {
        self.name = name
        self.createdAt = createdAt
        self.tasks = []
    }
}

@Model
final class ProjectTask {
    var title: String
    var isCompleted: Bool
    var project: Project?

    init(title: String, isCompleted: Bool = false) {
        self.title = title
        self.isCompleted = isCompleted
    }
}
```

### Example 3: Swift Testing

```swift
import Testing

struct ProjectTaskTests {
    @Test func newTaskStartsIncomplete() {
        let task = ProjectTask(title: "Write tests")

        #expect(task.title == "Write tests")
        #expect(task.isCompleted == false)
    }

    @Test func projectStoresTasks() throws {
        let project = Project(name: "App")
        let task = ProjectTask(title: "Implement feature")
        project.tasks.append(task)

        let storedTask = try #require(project.tasks.first)
        #expect(storedTask.title == "Implement feature")
    }
}
```

### Example 4: Multi-Platform Adaptive Layout

```swift
struct SidebarView: View {
    var body: some View {
        #if os(macOS)
        List {
            NavigationLink("Home", destination: HomeView())
            NavigationLink("Settings", destination: SettingsView())
        }
        .navigationTitle("Menu")
        #else
        List {
            NavigationLink(destination: HomeView()) {
                Label("Home", systemImage: "house")
            }
            NavigationLink(destination: SettingsView()) {
                Label("Settings", systemImage: "gear")
            }
        }
        .navigationTitle("Menu")
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }
}
```

## Prerequisites

- Xcode and an active Apple platform project
- Swift development environment
- Understanding of Swift fundamentals
- Xcode MCP tools when running inside Xcode

## Notes

This skill focuses on code generation and implementation choices without extended teaching. For teaching or mentoring scenarios where concepts need explanation, use the `swift-mentor` skill instead.

Key principles:

- Project settings and Apple documentation are the source of truth
- Xcode MCP tools first when running inside Xcode
- Idiomatic Swift code
- SwiftUI-first for UI, with representables when platform APIs require them
- SwiftData-first for new local persistence when it fits the project
- Swift Testing-first for new non-UI tests
- Structured concurrency for async operations
- Multi-platform awareness based on project settings
