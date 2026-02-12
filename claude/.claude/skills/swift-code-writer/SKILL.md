---
name: swift-code-writer
description: Generates idiomatic Swift code using modern patterns including structured concurrency, Observation framework, SwiftUI declarative UI, and SwiftData persistence for iOS/macOS applications.
version: 1.0.0
author: JD
category: development
tags: [swift, swiftui, swiftdata, concurrency, ios, macos, code-generation]
---

# Skill: Swift Code Writer

## Description

Generates production-quality Swift code following modern best practices and idioms for iOS/macOS development. Focuses on structured concurrency, the Observation framework, SwiftUI's declarative patterns, and SwiftData for persistence. Targets iOS 19+ and macOS 16+.

## When to Use This Skill

Use this skill when:
- Writing Swift code for experienced developers
- Focus is on correct, idiomatic implementation over teaching
- Modern Swift patterns and best practices must be followed
- Building SwiftUI applications with SwiftData
- Code needs to work across iOS, iPadOS, and macOS

## Instructions

### Target Specifications

- **Platform Targets**: iOS 19+, macOS 16+, iPadOS 19+
- **Swift Version**: Latest available in Xcode
- **Primary Frameworks**: SwiftUI, SwiftData
- **Concurrency Model**: Structured concurrency (`async/await`, Actors)

### Modern Swift Patterns (Required)

#### Concurrency
- Default to `async/await` for all asynchronous operations
- Use structured concurrency primitives:
  - `Task` for launching async work
  - `async let` for parallel async operations
  - Task Groups for dynamic parallel operations
  - Actors for managing concurrent mutable state
- Use modern `async`-aware system APIs (e.g., `URLSession.shared.data(from:)`)

#### Observation
- Use `@Observable` macro for all view models and observable objects
- Leverages Swift's Observation framework (replaces `@ObservableObject`)

#### Type System
- Leverage Swift's strong type system: protocols, generics, optionals
- Use value types (structs) by default; reference types (classes with `@Observable`) when needed
- Make type decisions based on semantics and performance requirements

### Legacy Patterns (Prohibited)

Do NOT use these patterns unless absolutely required for interoperability:

- **Completion Handlers/Delegates**: Refactor to `async/await`
- **NotificationCenter for State**: Use `@Environment`, observable objects, or dependency injection
- **Combine Framework**: Prefer `async/await` and `@Observable` (only use if specific API requires it)
- **UIKit/AppKit**: Avoid `UIViewRepresentable`/`NSViewRepresentable` (use only if no SwiftUI equivalent exists)
- **Core Data**: Use SwiftData instead (only use Core Data for legacy database migration)

### SwiftUI Guidelines

#### Multi-Platform Design
- Design features to work idiomatically on macOS, iOS, and iPadOS
- Respect platform conventions:
  - Sidebar navigation on macOS and iPadOS
  - Appropriate context menus
  - Platform-appropriate control sizing
- Use adaptive layouts for different screen sizes and input methods (touch, mouse, trackpad)
- Use compile-time platform checks when needed: `#if os(iOS)`, `#if os(macOS)`

#### Idiomatic SwiftUI
- Prefer semantic SwiftUI elements: `LabeledContent`, `Toggle`, `Picker`, `Slider`
- These provide accessibility, proper layout, and platform behaviors automatically
- Compose views into small, reusable components
- Use proper data flow: `@State`, `@Binding`, `@Environment`, `@Bindable`
- Use `NavigationStack` for navigation management
- Use `.task` for async work on view lifecycle (preferred over `.onAppear` for async operations)

### SwiftData Usage

- Use `@Model` macro for data models
- Use `ModelContext` for persistence operations
- Use `#Predicate` for type-safe queries
- Define relationships between models clearly
- SwiftData is the default for local persistence

### Package Management

- Only import Swift Packages when necessary
- Prefer official Apple packages when available
- Use widely-used, well-maintained community packages
- Ensure packages align with modern Swift tech stack
- Confirm major package additions with project requirements

### Code Quality Standards

#### Testing
- Write unit tests using XCTest for:
  - Models and data layer
  - View models and business logic
  - Critical application paths
- Tests should cover expected behavior and edge cases
- Use Xcode's UI Testing framework for UI tests when needed

#### Error Handling
- Use Swift's `Error` protocol for error types
- Handle errors with `do-try-catch` blocks
- Use `Result` type when appropriate
- Propagate and handle errors gracefully in `async` contexts
- Display error states clearly in SwiftUI views

#### Comments
- Document purpose, logic, and rationale (not "what" but "why")
- Explain use of specific Swift features when non-obvious:
  - Why `@Observable` is appropriate here
  - Why this specific `async` pattern
  - Complex generics or type constraints
  - Non-obvious SwiftUI modifiers or SwiftData queries
- Prefer single-line comments (`//`) over block comments
- Use underscore (`_`) for intentionally unused parameters

### Code Organization

#### View Complexity
- Refactor complex views into smaller, reusable subviews
- Keep view bodies focused and readable
- Extract repeated UI patterns into custom views

#### State Management
- For simple local state: `@State`
- For shared state across views: Create `@Observable` class and inject via `.environment()`
- For complex navigation: Use `NavigationPath` with `NavigationStack`

#### Readability & Maintainability
- Prioritize code clarity
- Use Swift's declarative patterns for UI and data flow
- Minimize imperative code
- Leverage SwiftUI's declarative nature

### Staying Current

Before generating code:
- Use search tools to verify current best practices for Swift/SwiftUI/SwiftData patterns
- Check for recent framework changes or deprecations in latest iOS/macOS releases
- Confirm API availability for target platform versions
- If discovering updated patterns or approaches, note for skill updates
- Suggest updating this skill or swift-mentor skill when significant changes are found

## Examples

### Example 1: Async Data Fetching with Error Handling

```swift
@Observable
class ArticleViewModel {
    var articles: [Article] = []
    var isLoading = false
    var error: Error?
    
    func fetchArticles() async {
        isLoading = true
        defer { isLoading = false }
        
        do {
            let (data, _) = try await URLSession.shared.data(from: articlesURL)
            articles = try JSONDecoder().decode([Article].self, from: data)
            error = nil
        } catch {
            self.error = error
            articles = []
        }
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
        .alert("Error", isPresented: .constant(viewModel.error != nil)) {
            Button("OK") { viewModel.error = nil }
        } message: {
            Text(viewModel.error?.localizedDescription ?? "")
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
    @Relationship(deleteRule: .cascade) var tasks: [Task]
    
    init(name: String, createdAt: Date = .now) {
        self.name = name
        self.createdAt = createdAt
        self.tasks = []
    }
}

@Model
final class Task {
    var title: String
    var isCompleted: Bool
    var project: Project?
    
    init(title: String, isCompleted: Bool = false) {
        self.title = title
        self.isCompleted = isCompleted
    }
}
```

### Example 3: Multi-Platform Adaptive Layout

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

- Xcode (latest version)
- Swift development environment
- Understanding of Swift fundamentals

## Notes

This skill focuses on code generation following modern Swift best practices without extensive explanations. For teaching or mentoring scenarios where concepts need explanation, use the `swift-mentor` skill instead.

Key principles:
- Modern patterns only (no legacy approaches)
- Idiomatic Swift code
- SwiftUI-first for UI
- SwiftData-first for persistence
- Structured concurrency for async operations
- Multi-platform awareness
