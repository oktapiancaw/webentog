# Contributing to Webentog

First off, thank you for taking the time to contribute! To maintain code quality and ensure a smooth development process, please follow these guidelines.

---

## 1. Branching Strategy

We use a **Fork & Pull Request** workflow.

- **`development`** (Default): The main integration branch. All features and bug fixes should be targeted here.
- **`master`** (or `main`): Reserved for stable, production-ready releases.
- **Feature Branches**: Create descriptive branches from `development` (e.g., `feat/add-kafka-producer` or `fix/db-connection`).

## 2. How to Contribute

1. **Fork** the repository to your own GitHub account.
2. **Clone** your fork locally:
   `git clone https://github.com/your-username/repository-name.git`
3. **Create a new branch** from `development`:
   `git checkout -b feat/your-feature-name`
4. **Commit your changes** with clear, descriptive messages using [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` for new features.
- `fix:` for bug fixes.
- `docs:` for documentation updates.

5. **Push** to your fork and **Open a Pull Request** against the `development` branch of this repository.

## 3. Engineering Standards

- **Python:** Adhere to **PEP 8** style guidelines.
- **Environment:** Never commit `.env` files or hardcoded credentials. Use environment variables.
- **Docker:** Update `Dockerfile` or `docker-compose.yml` if new dependencies or services are added.
- **Database:** Include migration files for any schema changes.
- **Testing:** Ensure unit tests pass and include new tests for added logic.

## 4. Pull Request Requirements

- Provide a clear description of the changes in the PR body.
- Resolve any merge conflicts before requesting a review.
- All conversations and feedback must be resolved/addressed before merging.
- Ensure CI/CD status checks (if any) are passing.

---

_By contributing, you agree that your contributions will be licensed under the project's current license._
