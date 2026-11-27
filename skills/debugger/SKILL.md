---
name: debugger
description: Use a real step-through debugger to investigate a reproducible code or test failure with breakpoints, stack traces, variables, and controlled stepping.
---

# Real debugger workflow

Use the debugger when runtime state or control flow cannot be established reliably from code, tests, and logs alone.

1. Reproduce the failure before starting a debug session.
2. Call `debugger_doctor` once for the current environment.
3. Use `debugger_call` with `create_debug_session` and the smallest relevant program or test.
4. Set one or two evidence-driven breakpoints before starting execution.
5. Start or continue to the breakpoint. Inspect the stack and local variables before stepping.
6. Prefer another breakpoint or a conditional breakpoint over long sequences of single-line steps.
7. Record the first state transition that contradicts the expected behavior.
8. Close the session with `close_debug_session`, then call `debugger_close` when the investigation is complete.

Never attach to production, shared environments, Kubernetes workloads, or a process the plugin did not launch. Do not request unrelated variables. Runtime values may contain credentials or regulated data even though the debugger applies secret redaction.

Common `debugger_call` operations include `list_supported_languages`, `create_debug_session`, `set_breakpoint`, `start_debugging`, `wait_for_stop`, `get_stack_trace`, `get_local_variables`, `get_variables`, `evaluate_expression`, `step_over`, `step_into`, `step_out`, `continue_execution`, `get_output`, and `close_debug_session`.

Pass the upstream MCP debugger arguments inside the `arguments` object. Keep every program, source, breakpoint, and working-directory path inside the current workspace.
