import ApiError from "../utils/ApiError.js";

export const validate = (schema)=>(req,res,next)=>{
    try {
        req.body = schema.parse(req.body);
        next()
    } catch (error) {
        throw new ApiError(400,error
        
        )
    }
}