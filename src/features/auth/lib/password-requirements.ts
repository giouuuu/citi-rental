export type PasswordRequirementId = "length" | "letter" | "number";

export type PasswordRequirement = {
  id: PasswordRequirementId;
  label: string;
  test: (password: string) => boolean;
};

export const passwordRequirements: PasswordRequirement[] = [
  {
    id: "length",
    label: "8–72 characters",
    test: (password) => password.length >= 8 && password.length <= 72,
  },
  {
    id: "letter",
    label: "At least one letter",
    test: (password) => /[A-Za-z]/.test(password),
  },
  {
    id: "number",
    label: "At least one number",
    test: (password) => /[0-9]/.test(password),
  },
];

export function evaluatePasswordRequirements(password: string) {
  return passwordRequirements.map((requirement) => ({
    ...requirement,
    met: requirement.test(password),
  }));
}
