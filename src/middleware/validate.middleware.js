import ApiError from "../utils/ApiError.js";

export const validate = (schema)=>(req,res,next)=>{
    try {
        req.body = schema.parse(req.body);
        next()
    } catch (error) {
        const errorMessage = error.errors?.map(e => e.message).join(", ") || error.message || "Validation failed";
        throw new ApiError(400, errorMessage);
    }
}