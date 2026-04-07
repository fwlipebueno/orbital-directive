import { updatePreferencesInputSchema } from "@orbital/shared";
import { userRepository } from "../../db/repositories/user-repository";
import { AppError } from "../../utils/errors";

export const userService = {
  async updatePreferences(userId: string, input: unknown) {
    const parsed = updatePreferencesInputSchema.parse(input);
    const updated = await userRepository.updatePreferences(userId, parsed.reducedSensoryMode, parsed.compactDensity);
    if (!updated) {
      throw new AppError("Unable to update preferences.", "PREFERENCES_UPDATE_FAILED", 500);
    }
    return {
      reducedSensoryMode: updated.reducedSensoryMode,
      compactDensity: updated.compactDensity
    };
  }
};
