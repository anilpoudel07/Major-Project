import {Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/role.middleware.js";
import { sanitize } from "../middleware/sanitization.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { roleSchema } from "../validation/role.validation.js";
import { removeRole, updateRoleByAdmin,deleteUser, getPendingNfcCard, verifyNfcCard, rejectNfcCard, getAllData } from "../controller/admin.controller.js";
const router = Router();
router.route("/get-all-data").get(verifyJWT,requireAdmin,getAllData)
router.route("/update-role/:userId").patch(verifyJWT,requireAdmin,sanitize,validate(roleSchema),updateRoleByAdmin)
router.route("/remove-role/:userId").patch(verifyJWT,requireAdmin,sanitize,validate(roleSchema),removeRole)
router.route("/delete-user/:userId").delete(verifyJWT,requireAdmin,sanitize,deleteUser)
router.route("/pending").get(verifyJWT,requireAdmin,getPendingNfcCard)
router.route("/verify/:id").patch(verifyJWT,requireAdmin,verifyJWT,verifyNfcCard)
router.route("/reject/:id").delete(verifyJWT,requireAdmin,rejectNfcCard);
export default router;