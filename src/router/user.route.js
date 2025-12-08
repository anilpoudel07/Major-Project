import { Router } from "express";
import { loginUser, logoutUser, registerUser } from "../controller/user.auth.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { userLoginSchema, userRegisterSchema } from "../validation/user.validation.js";
import { sanitize } from "../middleware/sanitization.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { nfcCardSchema } from "../validation/NfcCard.validation.js";
import { registerNfcCard } from "../controller/nfc.controller.js";

const routes  = Router();
routes.route("/profile").get(verifyJWT,async(req , res)=>{
    return res
    .status(200)
    .json({
        success:true,
        user:req.user,
        message:"Profile sucessfully fetched"
    })
})
routes.route("/register").post(sanitize, validate(userRegisterSchema),registerUser)
routes.route("/login").post(sanitize,validate(userLoginSchema),loginUser)
routes.route("/logout").post(verifyJWT,logoutUser)
routes.route("/registerNfc").post(sanitize,verifyJWT,validate(nfcCardSchema),registerNfcCard)

export default routes;
