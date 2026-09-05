import { useParams } from 'react-router'
import { AdminPostEditor } from '../admin-post'

export default function AdminBlogEdit() {
  return <AdminPostEditor id={useParams().id} />
}
